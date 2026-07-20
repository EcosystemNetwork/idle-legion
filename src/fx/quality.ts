// Motion quality tiers — the one dial every ambient effect reads.
//
// The Stronghold is meant to be watched, which means it animates constantly:
// walking crews, bubbling vats, torch flicker, falling dust. On a good machine
// that is the point of the screen. On a four-year-old phone it is a battery
// fire, and for a player with vestibular sensitivity it is unusable.
//
// So every ambient effect is budgeted through one tier, resolved once and
// published as `data-motion` on <html>. CSS gates whole animation families off
// that attribute (no per-effect JS branching), and components read the budget
// numbers for things CSS can't express — how many crew actors to mount, whether
// to pay for a WebGL actor at all.
//
// Resolution order, most authoritative first:
//   1. an explicit player choice (persisted)
//   2. prefers-reduced-motion: reduce  → "still"
//   3. weak-device hints (cores / memory)  → "lite"
//   4. a live frame-rate probe that can demote (never promote) a tier
import { useSyncExternalStore } from "react";

/**
 * full  — everything: WebGL actors, particles, parallax, ambient loops.
 * lite  — CSS-only: no WebGL actors, fewer emitters, slower loops, no parallax.
 * still — state is conveyed by colour, badges and static art. Nothing loops;
 *         only direct responses to a tap play, and briefly.
 */
export type MotionTier = "full" | "lite" | "still";

export interface MotionBudget {
  tier: MotionTier;
  /** Mount the Three.js room actor? */
  actors3d: boolean;
  /** Ambient emitters (dust, sparks, smoke) allowed per chamber. */
  emitters: number;
  /** Crew actors that walk their loop; the rest stand at their post. */
  walkers: number;
  /** Global multiplier on ambient animation duration (higher = calmer). */
  tempo: number;
  /** Parallax layers on the Kingdom map. */
  parallax: boolean;
  /** Play one-shot reaction animations (collect, upgrade, heal)? */
  reactions: boolean;
}

const BUDGETS: Record<MotionTier, MotionBudget> = {
  full: { tier: "full", actors3d: true, emitters: 14, walkers: 4, tempo: 1, parallax: true, reactions: true },
  lite: { tier: "lite", actors3d: false, emitters: 5, walkers: 2, tempo: 1.6, parallax: false, reactions: true },
  // `still` keeps reactions: a tap that produces no feedback reads as a dropped
  // input. Reduced motion means no *ambient* movement, not a dead interface —
  // the reaction animations are opacity/colour only (see fx.css `[data-motion]`).
  still: { tier: "still", actors3d: false, emitters: 0, walkers: 0, tempo: 2.4, parallax: false, reactions: true },
};

const STORE_KEY = "idle-legion-motion";
const TIERS: MotionTier[] = ["full", "lite", "still"];

let override: MotionTier | "auto" = readOverride();
let auto: MotionTier = "full";
let current: MotionTier = "full";
const listeners = new Set<() => void>();

function readOverride(): MotionTier | "auto" {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return v === "full" || v === "lite" || v === "still" ? v : "auto";
  } catch {
    return "auto";
  }
}

const prefersReduced = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

/** Static device hints — cheap, available before the first frame is drawn. */
function deviceTier(): MotionTier {
  if (typeof navigator === "undefined") return "full";
  if (prefersReduced()) return "still";
  const cores = navigator.hardwareConcurrency ?? 8;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  // Two weak signals rather than one: a phone can report 8 cores and 2 GB.
  if (cores <= 4 || mem <= 4) return "lite";
  return "full";
}

function resolve() {
  const next = override === "auto" ? auto : override;
  if (next === current) return;
  current = next;
  document.documentElement.dataset.motion = current;
  listeners.forEach((l) => l());
}

/** Demote one step. Never promotes — a machine that stuttered once will again. */
function demote() {
  const i = TIERS.indexOf(auto);
  if (i >= TIERS.length - 1) return;
  auto = TIERS[i + 1];
  resolve();
}

// --- live frame-rate probe -------------------------------------------------
// Static hints miss the actual cases that matter (a hot laptop, a background
// tab war, an integrated GPU choking on the bloom pass), so watch real frames
// for a few seconds after load and demote once if we can't hold a smooth rate.
// One probe, not a permanent monitor: continuously sampling to auto-tune would
// itself cost frames, and a tier that flips back and forth mid-session is more
// distracting than the effects it is trying to trim.
function probeFrameRate() {
  if (typeof requestAnimationFrame === "undefined") return;
  let frames = 0;
  let start = 0;
  let slowRuns = 0;
  const SAMPLE_MS = 2000;
  const step = (t: number) => {
    if (!start) start = t;
    frames++;
    const elapsed = t - start;
    if (elapsed < SAMPLE_MS) {
      requestAnimationFrame(step);
      return;
    }
    const fps = (frames * 1000) / elapsed;
    // A hidden tab is throttled to ~1fps by the browser; that is not a slow
    // device, so don't hold it against the machine.
    if (fps < 45 && !document.hidden) slowRuns++;
    if (slowRuns >= 2) {
      demote();
      return; // one demotion is enough; stop paying for the probe
    }
    if (slowRuns > 0 || frames === 0) {
      frames = 0;
      start = 0;
      requestAnimationFrame(step);
    }
  };
  // Wait for the first paint storm to settle before judging the machine.
  window.setTimeout(() => requestAnimationFrame(step), 2500);
}

export function initMotion() {
  if (typeof window === "undefined") return;
  auto = deviceTier();
  resolve();
  document.documentElement.dataset.motion = current;
  window
    .matchMedia?.("(prefers-reduced-motion: reduce)")
    ?.addEventListener?.("change", () => {
      auto = deviceTier();
      resolve();
    });
  probeFrameRate();
}

/** Player override. `"auto"` hands control back to detection. */
export function setMotionTier(tier: MotionTier | "auto") {
  override = tier;
  try {
    if (tier === "auto") localStorage.removeItem(STORE_KEY);
    else localStorage.setItem(STORE_KEY, tier);
  } catch {
    /* private mode — the choice just won't persist */
  }
  resolve();
}

export const motionOverride = () => override;
export const motionTier = () => current;
export const motionBudget = () => BUDGETS[current];

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** React binding. Re-renders only the components that actually branch on tier. */
export function useMotionBudget(): MotionBudget {
  return useSyncExternalStore(
    subscribe,
    () => BUDGETS[current],
    () => BUDGETS.full,
  );
}
