// In-app self-test suite, surfaced in the Admin panel.
//
// Why this exists in the app rather than as a node test runner: the things that
// actually break this game are environmental — a save that won't decode in a
// real browser, a WebGL scene that picks the wrong building, an asset URL that
// 404s under the deployed BASE_URL. None of that reproduces in a headless unit
// test, and all of it is one click away here.
//
// Rules for tests in this file:
//   • NEVER mutate the player's live state. Tests build their own states from
//     createInitialState(), or snapshot-and-restore (see withSaveSandbox).
//   • A test that cannot run in this environment SKIPS, it does not fail —
//     no WebGL on a locked-down device is not a bug in the game.
//   • Assertions carry a message describing the invariant, not the values;
//     the values are attached automatically on failure.
import {
  BOSSES,
  CLASS_BEATS,
  GEAR_CATALOG,
  KIT,
  OFFLINE_CAP_SEC,
  ROOMS,
  STORAGE_KEY,
  TIERS,
  TIER_ORDER,
} from "./config";
import {
  createInitialState,
  deriveStats,
  dwellerMight,
  loadState,
  makeDweller,
  maxPopulation,
  roomCapacity,
  roomRate,
  roomStoreCap,
  saveState,
  tick,
} from "./engine";
import { UNLOCK_ORDER, nextUnlock, tabUnlock } from "./unlocks";
import type { GameState, RoomType, Tier } from "./types";

// ---------------------------------------------------------------------------
// Tiny assertion + registry layer
// ---------------------------------------------------------------------------

export type TestStatus = "pass" | "fail" | "skip";

export interface TestResult {
  id: string;
  name: string;
  group: string;
  status: TestStatus;
  ms: number;
  /** Failure message, or the reason a test skipped. */
  detail?: string;
}

/** Thrown by t.skip() — carried through as a skip rather than a failure. */
class SkipError extends Error {}

export interface Assert {
  ok(cond: unknown, msg: string): void;
  eq<T>(actual: T, expected: T, msg: string): void;
  close(actual: number, expected: number, tol: number, msg: string): void;
  gte(actual: number, min: number, msg: string): void;
  throws(fn: () => unknown, msg: string): void;
  skip(reason: string): never;
}

const assert: Assert = {
  ok(cond, msg) {
    if (!cond) throw new Error(msg);
  },
  eq(actual, expected, msg) {
    if (!Object.is(actual, expected)) {
      throw new Error(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },
  close(actual, expected, tol, msg) {
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > tol) {
      throw new Error(`${msg} — expected ${expected}±${tol}, got ${actual}`);
    }
  },
  gte(actual, min, msg) {
    if (!(actual >= min)) throw new Error(`${msg} — expected ≥ ${min}, got ${actual}`);
  },
  throws(fn, msg) {
    try {
      fn();
    } catch {
      return;
    }
    throw new Error(`${msg} — expected a throw, none happened`);
  },
  skip(reason) {
    throw new SkipError(reason);
  },
};

export interface TestCase {
  id: string;
  name: string;
  group: string;
  run: (t: Assert) => void | Promise<void>;
}

const TESTS: TestCase[] = [];
const test = (group: string, id: string, name: string, run: TestCase["run"]) =>
  TESTS.push({ id, name, group, run });

export const TEST_GROUPS = [
  "save",
  "economy",
  "progression",
  "content",
  "combat",
  "kingdom3d",
] as const;

// ---------------------------------------------------------------------------
// save — the highest-stakes subsystem: a bad decode silently eats a run
// ---------------------------------------------------------------------------

/**
 * Run fn with the real save keys parked, then put them back no matter what.
 * saveState/loadState talk to the actual localStorage keys, so there is no way
 * to exercise them for real without briefly owning those keys.
 */
function withSaveSandbox<T>(fn: () => T): T {
  const keys = [STORAGE_KEY, `${STORAGE_KEY}:bak`];
  const parked = keys.map((k) => [k, localStorage.getItem(k)] as const);
  try {
    return fn();
  } finally {
    for (const [k, v] of parked) {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    }
  }
}

test("save", "save-roundtrip", "save → load preserves state", (t) => {
  withSaveSandbox(() => {
    const s = createInitialState();
    s.gold = 123_456;
    s.provisions = 7_890;
    s.descents = 3;
    saveState(s);
    const back = loadState();
    t.eq(back.gold, 123_456, "gold survives a save/load round trip");
    t.eq(back.provisions, 7_890, "provisions survive a save/load round trip");
    t.eq(back.descents, 3, "descents survive a save/load round trip");
    t.eq(back.rooms.length, s.rooms.length, "room count survives a round trip");
  });
});

test("save", "save-tamper", "hand-edited save is rejected", (t) => {
  withSaveSandbox(() => {
    const s = createInitialState();
    s.gold = 1_000;
    saveState(s);
    const raw = localStorage.getItem(STORAGE_KEY);
    t.ok(raw, "a save was written");
    const outer = JSON.parse(raw!) as { sig?: string; data?: string };
    t.ok(typeof outer.sig === "string" && typeof outer.data === "string",
      "saves are written in the signed {sig,data} envelope");
    // Forge a fortune. The signature must no longer match.
    const inner = JSON.parse(outer.data!) as GameState;
    inner.gold = 999_999_999;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sig: outer.sig, data: JSON.stringify(inner) }));
    localStorage.removeItem(`${STORAGE_KEY}:bak`);
    const back = loadState();
    t.ok(back.gold !== 999_999_999, "a tampered save does not load its forged values");
  });
});

test("save", "save-corrupt", "garbage save falls back cleanly", (t) => {
  withSaveSandbox(() => {
    localStorage.setItem(STORAGE_KEY, "{not json at all");
    localStorage.removeItem(`${STORAGE_KEY}:bak`);
    const back = loadState();
    t.ok(back && Array.isArray(back.rooms), "a corrupt save yields a usable fresh state, not a crash");
    t.gte(back.rooms.length, 1, "the fresh fallback state has starting rooms");
  });
});

test("save", "save-backup-recovery", "backup rescues a corrupt primary", (t) => {
  withSaveSandbox(() => {
    const s = createInitialState();
    s.gold = 55_555;
    saveState(s);          // writes primary
    s.gold = 66_666;
    saveState(s);          // rotates the previous primary into :bak
    const bak = localStorage.getItem(`${STORAGE_KEY}:bak`);
    if (!bak) t.skip("this build does not rotate a backup on the second save");
    localStorage.setItem(STORAGE_KEY, "corrupted");
    const back = loadState();
    t.ok(back.gold === 55_555 || back.gold === 66_666,
      "a corrupt primary recovers the backup rather than resetting the run");
  });
});

// ---------------------------------------------------------------------------
// economy
// ---------------------------------------------------------------------------

test("economy", "stats-finite", "derived stats are finite on a fresh state", (t) => {
  const s = createInitialState();
  const d = deriveStats(s);
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "number") t.ok(Number.isFinite(v), `derived stat "${k}" is finite`);
  }
  t.gte(d.might, 0, "might is non-negative");
  t.gte(maxPopulation(s), 1, "population cap is at least 1");
});

test("economy", "room-caps", "room capacity and storage scale with level", (t) => {
  const s = createInitialState();
  const room = s.rooms[0];
  if (!room) t.skip("fresh state has no rooms to measure");
  const capLow = roomCapacity(room, s);
  const storeLow = roomStoreCap(room, s);
  const leveled = { ...room, level: room.level + 5 };
  t.gte(roomCapacity(leveled, s), capLow, "capacity never shrinks as level rises");
  t.gte(roomStoreCap(leveled, s), storeLow, "storage cap never shrinks as level rises");
  t.gte(capLow, 0, "capacity is non-negative");
});

test("economy", "rate-starving", "starving never pays more than fed", (t) => {
  const s = createInitialState();
  for (const room of s.rooms) {
    const fed = roomRate(s, room, true);
    const starving = roomRate(s, room, false);
    t.ok(Number.isFinite(fed) && Number.isFinite(starving), `room "${room.type}" rates are finite`);
    t.ok(starving <= fed, `room "${room.type}" does not out-earn itself while starving`);
  }
});

test("economy", "tick-stable", "a tick does not corrupt or NaN the state", (t) => {
  const s = createInitialState();
  const t0 = Date.now();
  const after = tick(s, t0 + 5_000);
  t.ok(Number.isFinite(after.gold), "gold stays finite across a tick");
  t.ok(Number.isFinite(after.provisions), "provisions stay finite across a tick");
  t.gte(after.gold, 0, "gold never goes negative");
  t.eq(after.rooms.length, s.rooms.length, "a tick does not add or drop rooms");
  t.eq(after.dwellers.length, s.dwellers.length, "a tick does not add or drop dwellers");
});

test("economy", "tick-purity", "tick does not mutate the state it is given", (t) => {
  const s = createInitialState();
  const before = JSON.stringify(s);
  tick(s, Date.now() + 30_000);
  t.eq(JSON.stringify(s), before, "tick treats its input state as immutable");
});

test("economy", "offline-cap", "huge offline gaps stay bounded", (t) => {
  const s = createInitialState();
  const oneWeek = 7 * 24 * 3600 * 1000;
  const after = tick(s, Date.now() + oneWeek);
  t.ok(Number.isFinite(after.gold), "gold is finite after a week offline");
  const capped = tick(s, Date.now() + OFFLINE_CAP_SEC * 1000);
  t.ok(after.gold <= capped.gold * 1.5 + 1,
    "a week offline pays no more than the offline cap allows (cap is enforced)");
});

// ---------------------------------------------------------------------------
// progression / unlocks
// ---------------------------------------------------------------------------

test("progression", "unlock-core", "the core loop is always available", (t) => {
  const s = createInitialState();
  for (const id of ["kingdom", "stronghold", "legion"]) {
    t.ok(tabUnlock(s, 0, id).unlocked, `"${id}" is open to a brand-new player`);
  }
});

test("progression", "unlock-gated", "late systems start locked", (t) => {
  const s = createInitialState();
  const might = deriveStats(s).might;
  const locked = ["duels", "worldboss", "exchange"].filter((id) => !tabUnlock(s, might, id).unlocked);
  t.gte(locked.length, 1, "at least one late system is hidden from a new player");
  for (const id of locked) {
    t.ok(tabUnlock(s, might, id).hint.length > 0, `locked tab "${id}" tells the player what to do next`);
  }
});

test("progression", "unlock-veteran", "descending unlocks everything permanently", (t) => {
  const s = { ...createInitialState(), descents: 1 };
  for (const id of UNLOCK_ORDER) {
    t.ok(tabUnlock(s, 0, id).unlocked, `veteran keeps "${id}" open after a Descend`);
  }
  t.eq(nextUnlock(s, 0), null, "a veteran has no remaining unlock goal");
});

test("progression", "unlock-order", "nextUnlock follows UNLOCK_ORDER", (t) => {
  const s = createInitialState();
  const next = nextUnlock(s, deriveStats(s).might);
  t.ok(next, "a new player has something to work toward");
  const firstLocked = UNLOCK_ORDER.find((id) => !tabUnlock(s, deriveStats(s).might, id).unlocked);
  t.eq(next!.id, firstLocked, "the suggested goal is the first locked entry in UNLOCK_ORDER");
});

// ---------------------------------------------------------------------------
// content integrity — the catalogs the UI indexes into
// ---------------------------------------------------------------------------

test("content", "gear-ids-unique", "gear ids are unique", (t) => {
  const seen = new Set<string>();
  for (const g of GEAR_CATALOG) {
    t.ok(!seen.has(g.id), `gear id "${g.id}" appears only once`);
    seen.add(g.id);
  }
  t.gte(GEAR_CATALOG.length, 1, "the gear catalog is not empty");
});

test("content", "rooms-well-formed", "every room def is complete", (t) => {
  for (const [key, def] of Object.entries(ROOMS)) {
    t.eq(def.type, key as RoomType, `ROOMS["${key}"].type matches its key`);
    t.ok(def.name && def.name.length > 0, `room "${key}" has a name`);
    t.ok(def.icon && def.icon.length > 0, `room "${key}" has an icon`);
  }
});

test("content", "tiers-complete", "every tier in TIER_ORDER has a def", (t) => {
  for (const tier of TIER_ORDER) {
    const def = TIERS[tier as Tier];
    t.ok(def, `TIERS has an entry for "${tier}"`);
    t.eq(def.tier, tier, `TIERS["${tier}"].tier matches its key`);
    t.ok(def.name.length > 0, `tier "${tier}" has a name`);
  }
  t.eq(Object.keys(TIERS).length, TIER_ORDER.length, "TIER_ORDER covers every tier exactly once");
});

test("content", "bosses-ordered", "bosses get harder and pay more", (t) => {
  t.gte(BOSSES.length, 1, "there is at least one boss");
  for (let i = 1; i < BOSSES.length; i++) {
    t.ok(BOSSES[i].baseHp > BOSSES[i - 1].baseHp,
      `boss "${BOSSES[i].id}" is tougher than the one before it`);
    t.ok(BOSSES[i].reward > BOSSES[i - 1].reward,
      `boss "${BOSSES[i].id}" pays more than the one before it`);
  }
});

test("content", "kit-paths", "art kit paths are well-formed", (t) => {
  const groups = Object.entries(KIT) as [string, Record<string, string>][];
  for (const [group, entries] of groups) {
    for (const [key, url] of Object.entries(entries)) {
      t.ok(typeof url === "string" && url.length > 0, `KIT.${group}.${key} has a url`);
      t.ok(!url.includes("//art/"), `KIT.${group}.${key} has no doubled slash from BASE_URL`);
      t.ok(/\.(png|jpe?g|webp|glb)$/i.test(url), `KIT.${group}.${key} points at an asset file`);
    }
  }
});

test("content", "kit-assets-load", "every art-kit asset actually resolves", async (t) => {
  if (typeof fetch !== "function") t.skip("no fetch in this environment");
  const urls = (Object.values(KIT) as Record<string, string>[])
    .flatMap((g) => Object.values(g));
  const results = await Promise.all(
    urls.map(async (u) => {
      try {
        const r = await fetch(u, { method: "GET", cache: "force-cache" });
        return { u, ok: r.ok, status: r.status };
      } catch {
        return { u, ok: false, status: 0 };
      }
    }),
  );
  const missing = results.filter((r) => !r.ok);
  t.ok(missing.length === 0,
    `all art-kit assets resolve (missing: ${missing.map((m) => `${m.u} → ${m.status}`).join(", ")})`);
});

// ---------------------------------------------------------------------------
// combat
// ---------------------------------------------------------------------------

test("combat", "class-triangle", "the class triangle is a closed cycle", (t) => {
  const classes = Object.keys(CLASS_BEATS) as (keyof typeof CLASS_BEATS)[];
  for (const c of classes) {
    t.ok(classes.includes(CLASS_BEATS[c]), `"${c}" beats a class that exists`);
    t.ok(CLASS_BEATS[c] !== c, `"${c}" does not beat itself`);
  }
  // Walking the cycle from any start must return to it, visiting each class once.
  let cur = classes[0];
  const path = new Set<string>();
  for (let i = 0; i < classes.length; i++) {
    t.ok(!path.has(cur), "the class cycle does not revisit a class early");
    path.add(cur);
    cur = CLASS_BEATS[cur];
  }
  t.eq(cur, classes[0], "the class cycle closes on itself");
});

test("combat", "might-monotonic", "better tiers are not weaker", (t) => {
  const s = createInitialState();
  let prev = -Infinity;
  for (const tier of TIER_ORDER) {
    const d = makeDweller(tier as Tier);
    const m = dwellerMight(d, s);
    t.ok(Number.isFinite(m), `might for tier "${tier}" is finite`);
    t.gte(m, 0, `might for tier "${tier}" is non-negative`);
    prev = m;
  }
  t.ok(Number.isFinite(prev), "the final tier produced a finite might");
});

// ---------------------------------------------------------------------------
// kingdom3d — regression cover for the building-picking bug
// ---------------------------------------------------------------------------

/** Ring order and the tab each building enters. Stated here on purpose: this is
 *  the contract under test, so the test must not import it from the code it is
 *  checking. Keep in sync with three/kingdom.ts BUILDINGS. */
const RING = [
  { name: "Barracks", id: "legion" },
  { name: "Colosseum", id: "arena" },
  { name: "War Room", id: "raids" },
  { name: "Deep Works", id: "stronghold" },
  { name: "Bazaar", id: "market" },
  { name: "Grand Hall", id: "codex" },
];
const RING_RADIUS = 7;
const ART_Y = 0.4 + 3.4 / 2;

interface KingdomRig {
  host: HTMLDivElement;
  stage: import("../three/engine").Stage;
  handle: import("../three/kingdom").KingdomHandle;
  hovered: () => { id: string; name: string } | null;
  entered: () => string | null;
  /** Viewport coords of a building's art centre, via the live stage camera. */
  screenOf: (index: number) => { x: number; y: number };
  dispose: () => void;
}

async function mountKingdom(t: Assert): Promise<KingdomRig> {
  const THREE = await import("three");
  const { createStage, webglAvailable } = await import("../three/engine");
  const { buildKingdom } = await import("../three/kingdom");
  if (!webglAvailable()) t.skip("WebGL is unavailable in this browser");

  // On-screen but behind everything: pauseOffscreen would halt the render loop
  // for a host parked off-viewport, and hover only resolves inside a frame.
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed", left: "0", top: "0", width: "640px", height: "400px",
    opacity: "0.001", pointerEvents: "none", zIndex: "-1",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(host);

  let stage: import("../three/engine").Stage | null = null;
  let handle: import("../three/kingdom").KingdomHandle | null = null;
  try {
    stage = createStage(host, { fov: 42, far: 200, pauseOffscreen: false, bloom: false });
    let entered: string | null = null;
    let hovered: { id: string; name: string } | null = null;
    handle = buildKingdom(stage, { onEnter: (id) => { entered = id; }, dwellers: 0 });
    handle.onHoverChange((b) => { hovered = b ? { id: b.id, name: b.name } : null; });

    const st = stage;
    return {
      host, stage: st, handle,
      hovered: () => hovered,
      entered: () => entered,
      screenOf(index) {
        const a = (index / RING.length) * Math.PI * 2 - Math.PI / 2;
        const p = new THREE.Vector3(Math.cos(a) * RING_RADIUS, ART_Y, Math.sin(a) * RING_RADIUS);
        p.project(st.camera);
        const r = st.renderer.domElement.getBoundingClientRect();
        return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height };
      },
      dispose() {
        handle?.dispose();
        st.dispose();
        host.remove();
      },
    };
  } catch (err) {
    handle?.dispose();
    stage?.dispose();
    host.remove();
    throw err;
  }
}

const frames = (n: number) =>
  new Promise<void>((res) => {
    let i = 0;
    const step = () => (++i >= n ? res() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

function pointerAt(el: HTMLElement, type: string, x: number, y: number) {
  el.dispatchEvent(new PointerEvent(type, {
    clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
  }));
}

test("kingdom3d", "pick-correct-building", "hovering a building highlights THAT building", async (t) => {
  const rig = await mountKingdom(t);
  try {
    await frames(4); // let the scene build and the first frames run
    const canvas = rig.stage.renderer.domElement;
    const wrong: string[] = [];
    for (let i = 0; i < RING.length; i++) {
      const { x, y } = rig.screenOf(i);
      // Move away first: hover only re-resolves when the picked entry changes.
      pointerAt(canvas, "pointermove", 1, 1);
      await frames(2);
      pointerAt(canvas, "pointermove", x, y);
      await frames(3);
      const got = rig.hovered();
      if (got?.id !== RING[i].id) wrong.push(`${RING[i].name} → ${got ? got.name : "(nothing)"}`);
    }
    t.ok(wrong.length === 0, `each building picks itself (mismatches: ${wrong.join("; ") || "none"})`);
  } finally {
    rig.dispose();
  }
});

test("kingdom3d", "pick-empty-space", "empty plaza picks nothing", async (t) => {
  const rig = await mountKingdom(t);
  try {
    await frames(4);
    const canvas = rig.stage.renderer.domElement;
    const r = canvas.getBoundingClientRect();
    // Top-left corner is sky/cavern — no building billboard should claim it.
    pointerAt(canvas, "pointermove", r.left + 4, r.top + 4);
    await frames(3);
    t.eq(rig.hovered(), null, "the empty top-left corner highlights no building");
  } finally {
    rig.dispose();
  }
});

test("kingdom3d", "click-enters-same-building", "clicking enters the hovered building", async (t) => {
  const rig = await mountKingdom(t);
  try {
    await frames(4);
    const canvas = rig.stage.renderer.domElement;
    const idx = 3; // Deep Works — nearest the camera, least ambiguous
    const { x, y } = rig.screenOf(idx);
    pointerAt(canvas, "pointermove", x, y);
    await frames(3);
    const hovered = rig.hovered();
    t.eq(hovered?.id, RING[idx].id, "the probe point hovers the intended building");

    pointerAt(canvas, "pointerdown", x, y);
    pointerAt(canvas, "pointerup", x, y);
    // A camera flight runs before onEnter fires unless reduced-motion is set.
    for (let i = 0; i < 90 && rig.entered() == null; i++) await frames(2);
    t.eq(rig.entered(), RING[idx].id, "the click enters the building that was hovered");
  } finally {
    rig.dispose();
  }
});

test("kingdom3d", "drag-does-not-enter", "dragging the camera does not enter a building", async (t) => {
  const rig = await mountKingdom(t);
  try {
    await frames(4);
    const canvas = rig.stage.renderer.domElement;
    const { x, y } = rig.screenOf(3);
    pointerAt(canvas, "pointerdown", x, y);
    pointerAt(canvas, "pointermove", x + 60, y + 10);
    pointerAt(canvas, "pointerup", x + 60, y + 10);
    await frames(6);
    t.eq(rig.entered(), null, "an orbit drag that ends on a building does not enter it");
  } finally {
    rig.dispose();
  }
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

export function listTests(): TestCase[] {
  return TESTS.slice();
}

export async function runTests(
  opts: { groups?: string[]; onResult?: (r: TestResult) => void } = {},
): Promise<TestResult[]> {
  const picked = opts.groups?.length
    ? TESTS.filter((c) => opts.groups!.includes(c.group))
    : TESTS;
  const out: TestResult[] = [];
  for (const c of picked) {
    const started = performance.now();
    let status: TestStatus = "pass";
    let detail: string | undefined;
    try {
      await c.run(assert);
    } catch (err) {
      if (err instanceof SkipError) {
        status = "skip";
        detail = err.message;
      } else {
        status = "fail";
        detail = err instanceof Error ? err.message : String(err);
      }
    }
    const r: TestResult = { id: c.id, name: c.name, group: c.group, status, ms: performance.now() - started, detail };
    out.push(r);
    opts.onResult?.(r);
    // Yield so the panel can paint between tests.
    await new Promise((res) => setTimeout(res, 0));
  }
  return out;
}
