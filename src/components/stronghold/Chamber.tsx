// A chamber of the stronghold, drawn as a place rather than a card.
//
// The composition is a stack of layers, back to front:
//
//   ch-shell    the painterly backdrop + tier dressing (timber, stone, gilding)
//   ch-props    placed props, standing on the floor at fixed anchors
//   ch-yield    the output physically heaping up — and the thing you click
//   ch-crew     workers walking between posts, doing a role-specific verb
//   ch-air      dust / sparks / smoke / rats, chosen by state
//   ch-light    the room's light, warmed by work and reddened by trouble
//   ch-signs    diegetic hung signs; the only "UI" inside the room
//
// Everything each layer needs comes from ONE `RoomVisual` (see game/roomState).
// No layer re-derives state, and no state gets a bespoke branch here: a new
// state is a new row in roomState.ts plus a rule in stronghold.css.
import { useEffect, useRef, useState } from "react";
import {
  aptitudeMatches,
  dwellerMaxHp,
  dwellerMight,
  formatNum,
  hpFrac,
  upgradeCost,
} from "../../game/engine";
import { APTITUDE_ICON, APTITUDE_LABEL, ROOMS, TIER_PORTRAIT, TIERS } from "../../game/config";
import { INTERIOR } from "../../game/interiors";
import { PROP_BY_ID, ROOM_TIERS, propFitsRoom, roomArt } from "../../game/rooms";
import { deriveRoomVisual, type RoomBadge, type RoomVisual } from "../../game/roomState";
import type { useGame } from "../../hooks/useGame";

/** The action surface `useGame` hands out — inferred, so it can't drift. */
type Actions = ReturnType<typeof useGame>["actions"];
import type { DerivedStats, Dweller, GameState, PropItem, Room, RoomType } from "../../game/types";
import { burst, centerOf, coinArc, floatText, ring, sfx, shake } from "../../fx/juice";
import { useMotionBudget } from "../../fx/quality";
import { beginHeroDrag, endHeroDrag, useDraggedHero } from "./dragState";
import { STAGE, hash01, propShape } from "./stage";

const GOLD_CHIP = ".chip-stat.gold";

/** How long a one-shot reaction class stays on the element. */
const REACTION_MS = 900;

/**
 * Adds a class for a beat, then takes it off. Used for the reaction animations
 * (collect, upgrade, heal) — the ones that must fire on an *event* rather than
 * follow a state, so they can't be expressed as a `data-state` rule.
 */
function useReaction(): [string, (name: string) => void] {
  const [cls, setCls] = useState("");
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [
    cls,
    (name: string) => {
      window.clearTimeout(timer.current);
      // Clear first so re-firing the same reaction restarts the animation.
      setCls("");
      requestAnimationFrame(() => setCls(`react-${name}`));
      timer.current = window.setTimeout(() => setCls(""), REACTION_MS);
    },
  ];
}

export interface ChamberProps {
  room: Room;
  state: GameState;
  stats: DerivedStats;
  now: number;
  actions: Actions;
  onAssign: (roomId: string) => void;
  onHero: (id: string) => void;
  onOpenWarChest: () => void;
  onOpenRaids: () => void;
  /** The Master's 3D model, rendered only in the Quarters. */
  masterSlot?: React.ReactNode;
}

export function Chamber(props: ChamberProps) {
  const { room, state, stats, now, actions, onAssign, onHero, onOpenWarChest, onOpenRaids } = props;
  const v = deriveRoomVisual(state, room, stats, now);
  const def = ROOMS[room.type];
  const stage = STAGE[room.type];
  const budget = useMotionBudget();
  const dragged = useDraggedHero();
  const [over, setOver] = useState(false);
  const [reaction, fire] = useReaction();
  const rootRef = useRef<HTMLElement | null>(null);

  const isVault = room.type === "warchest";
  const isHall = room.type === "hall";
  const acceptsDrop = v.capacity > 0 || isHall;

  // The aptitude verdict for whoever is inbound. This is the whole point of
  // publishing the drag: the player sees "these are the right hands" BEFORE
  // letting go, not after reading a tooltip.
  const verdict = !dragged
    ? null
    : isHall
      ? "rest"
      : v.capacity === 0
        ? "bad"
        : v.workers.length >= v.capacity
          ? "full"
          : aptitudeMatches(room, dragged)
            ? "match"
            : "off";

  const flags = Object.entries(v.flags)
    .filter(([, on]) => on)
    .map(([k]) => k)
    .join(" ");

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    endHeroDrag();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    if (isHall) actions.unassign(id);
    else if (v.capacity > 0) actions.assign(id, room.id);
    fire("assign");
    sfx.click();
  };

  const collect = (el: HTMLElement | null) => {
    if (v.stored < 1) return;
    const c = centerOf(el);
    if (def.produces === "gold") {
      const coins = Math.min(24, 6 + Math.round(Math.log10(v.stored + 1) * 6));
      coinArc(c, GOLD_CHIP, coins);
      ring(c.x, c.y, "#ffd76b", 16);
      floatText(c.x, c.y - 8, `+${formatNum(v.stored)}`, { color: "#ffe08a", big: v.stored > 100 });
    } else {
      const color = def.produces === "provisions" ? "#5fe38a" : "#ff8a7a";
      burst(c.x, c.y, { color, count: 12, kind: "spark", power: 4 });
      floatText(c.x, c.y - 8, `+${formatNum(v.stored)}`, { color });
      sfx.collect();
    }
    fire("collect");
    if (isVault) actions.collectWarChest();
    else actions.collect(room.id);
  };

  const doUpgrade = () => {
    const c = centerOf(rootRef.current);
    burst(c.x, c.y, { color: "#cbb488", count: 18, kind: "shard", power: 5 });
    floatText(c.x, c.y - 20, `Lv ${room.level + 1}`, { color: "#ffe08a", big: true });
    sfx.build();
    fire("upgrade");
    actions.upgrade(room.id);
  };

  const doRush = () => {
    try {
      actions.rush(room.id);
      fire("rush");
      shake(4);
      sfx.whoosh();
    } catch {
      sfx.error();
    }
  };

  // The Master isn't a "worker" — he holds court, tracked by roomId alone.
  const master = props.masterSlot ? state.dwellers.find((d) => d.roomId === room.id) : null;

  // Off-duty legionaries drift through the Hall — they aren't "workers", but
  // showing them is the entire read of the room.
  const loiterers = isHall
    ? state.dwellers.filter((d) => d.roomId == null).slice(0, budget.walkers + 2)
    : [];

  return (
    <article
      ref={rootRef}
      className={`chamber ${room.type} ${reaction}`}
      data-room={room.type}
      data-state={v.primary}
      data-flags={flags}
      data-tier={v.tier}
      data-drop={over && verdict ? verdict : undefined}
      style={
        {
          "--fill": v.fill,
          "--activity": v.activity,
          "--light-i": v.lightIntensity,
          "--flicker": `${v.flickerSec}s`,
          "--hue": stage.hue,
          "--tempo": budget.tempo,
        } as React.CSSProperties
      }
      aria-label={`${def.name}, level ${room.level}, ${v.primary}`}
      onDragOver={(e) => {
        if (!acceptsDrop) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <Shell visual={v} type={room.type} />
      <PropLayer visual={v} state={state} />
      {props.masterSlot ? (
        <>
          <div className="ch-master-model">{props.masterSlot}</div>
          {master && (
            <div className="ch-master">
              <button type="button" className="master-plate" onClick={() => onHero(master.id)}>
                <span className="master-crown">👑</span>
                <span className="master-name">{master.name}</span>
                <span className="master-might">{Math.floor(dwellerMight(master, state))} ⚔</span>
                <span className="master-cta">tap to equip</span>
              </button>
            </div>
          )}
        </>
      ) : (
        <CrewLayer
          visual={v}
          loiterers={loiterers}
          onHero={onHero}
          onAssign={() => onAssign(room.id)}
          walkers={budget.walkers}
        />
      )}
      <YieldPile visual={v} onCollect={collect} />
      <AmbientLayer visual={v} emitters={budget.emitters} />
      <div className="ch-light" aria-hidden />

      <header className="ch-plaque">
        <span className="ch-icon">{def.icon}</span>
        <span className="ch-name">{def.name}</span>
        <span className="ch-lvl" title={`${ROOM_TIERS[v.tier].name} — ${ROOM_TIERS[v.tier].blurb}`}>
          {room.level}
        </span>
        {def.aptitude && (
          <span className="ch-apt" title={`Prefers ${APTITUDE_LABEL[def.aptitude]} (+25%)`}>
            {APTITUDE_ICON[def.aptitude]}
          </span>
        )}
      </header>

      <Signs badges={v.badges} />

      <footer className="ch-foot">
        {v.storeCap > 0 ? (
          <div className="prod-meter" title={`${v.rate.toFixed(1)}/s → ${formatNum(v.storeCap)} cap`}>
            <i style={{ width: `${v.fill * 100}%` }} className={v.flags.full ? "full" : ""} />
            <b>+{v.rate.toFixed(1)}/s</b>
          </div>
        ) : (
          <span className="ch-note">{def.description}</span>
        )}
        <div className="ch-ctrls">
          {def.produces && !isVault && (
            <button
              type="button"
              className="chip-btn"
              title={v.shakenMs > 0 ? `Still shaken — ${Math.ceil(v.shakenMs / 1000)}s` : "Rush — risks an incident"}
              disabled={v.shakenMs > 0 || v.flags.incident}
              onClick={doRush}
            >
              ⚡
            </button>
          )}
          {v.capacity > 0 && (
            <button type="button" className="chip-btn" title="Auto-staff with the best hands" onClick={() => actions.autoStaff(room.id)}>
              👥
            </button>
          )}
          {room.type === "warroom" && (
            <button type="button" className="chip-btn go" onClick={onOpenRaids}>
              Raid ▸
            </button>
          )}
          {isVault && (
            <button type="button" className="chip-btn go" onClick={onOpenWarChest}>
              Vault ▸
            </button>
          )}
          {!isVault && (
            <button
              type="button"
              className="chip-btn up"
              disabled={state.gold < v.upgradeCost}
              title={`Cut this chamber wider — Lv ${room.level + 1}`}
              onClick={doUpgrade}
            >
              ▲ {formatNum(v.upgradeCost)}
            </button>
          )}
        </div>
      </footer>

      {v.flags.incident && (
        <div className="ch-incident" role="status">
          <span className="inc-glyph" aria-hidden>
            {v.incidentKind === "vermin" ? "🐀" : v.incidentKind === "cavein" ? "🪨" : "⚔"}
          </span>
          <b>{state.incident?.label}</b>
          <span className="inc-timer">{Math.max(0, Math.ceil(v.incidentMs / 1000))}s</span>
        </div>
      )}

      {over && verdict && (
        <div className="ch-verdict" data-verdict={verdict} aria-hidden>
          {verdict === "match" && <>▲ right hands · +25%</>}
          {verdict === "off" && <>◆ will work, no bonus</>}
          {verdict === "rest" && <>↩ send to rest</>}
          {verdict === "full" && <>✕ no free posts</>}
          {verdict === "bad" && <>✕ no work here</>}
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------- layers

/** Backdrop + the dressing that makes a tier-4 hall unmistakably not a tier-1 hole. */
function Shell({ visual, type }: { visual: RoomVisual; type: RoomType }) {
  // Prefer the painterly interior when one is drawn for this room; otherwise
  // the tier shell. Both fall through to the same tier dressing on top.
  const art = INTERIOR[type] ?? roomArt(type, visual.tier);
  return (
    <div className="ch-shell" aria-hidden>
      {/* Hewn rock sits under every chamber. Most shell/interior plates in
          ART_BRIEF.md aren't drawn yet, so a 404 has to degrade to "a hole in
          the mountain" — which is exactly what a tier-1 room IS — rather than
          to a black rectangle. When the art lands it simply covers this. */}
      <span className="ch-rock" />
      <img
        className="ch-art"
        src={art}
        alt=""
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      {/* Tier dressing: each layer is gated by data-tier in CSS, so upgrading a
          room visibly *adds* structure instead of swapping one picture for another. */}
      <span className="dress dress-timber" />
      <span className="dress dress-stone" />
      <span className="dress dress-gild" />
      <span className="dress dress-banner" />
      <span className="dress dress-mosaic" />
      <span className="ch-torch t1" />
      <span className="ch-torch t2" />
      <span className="ch-floor" />
      {/* Masonry scaffolding — only visible while data-state="upgrading". */}
      <span className="ch-scaffold" />
    </div>
  );
}

/** Placed props, standing on the floor at the room's anchor slots. */
function PropLayer({ visual, state }: { visual: RoomVisual; state: GameState }) {
  const stage = STAGE[visual.type];
  const placed = state.props.filter((p: PropItem) => p.roomId === visual.room.id);
  if (placed.length === 0) return null;
  return (
    <div className="ch-props" aria-hidden>
      {placed.slice(0, stage.props.length).map((item, i) => {
        const pd = PROP_BY_ID[item.defId];
        const a = stage.props[i];
        const onTheme = pd ? propFitsRoom(pd, visual.type) : true;
        return (
          <span
            key={item.id}
            className="prop"
            data-shape={propShape(item.defId)}
            data-family={pd?.family ?? "trophy"}
            data-theme={onTheme ? "on" : "off"}
            title={pd ? `${pd.name}${onTheme ? "" : " — off-theme, half effect"}` : ""}
            style={
              {
                left: `${a.x}%`,
                top: `${a.y}%`,
                "--s": a.s,
                "--pd": `${hash01(item.id) * 3}s`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

/**
 * The crew. Each worker walks a short loop between a rest spot and their post,
 * plays a role verb while there, and carries their aptitude on their sleeve.
 * Loops are desynced by a hash of the dweller id — without that the whole
 * stronghold swings on the same frame and reads as a screensaver.
 */
function CrewLayer({
  visual,
  loiterers,
  onHero,
  onAssign,
  walkers,
}: {
  visual: RoomVisual;
  loiterers: Dweller[];
  onHero: (id: string) => void;
  onAssign: () => void;
  walkers: number;
}) {
  const stage = STAGE[visual.type];
  const free = Math.max(0, visual.capacity - visual.workers.length);
  const apt = ROOMS[visual.type].aptitude;

  return (
    <div className="ch-crew">
      {visual.workers.map((d, i) => (
        <CrewActor
          key={d.id}
          d={d}
          post={stage.posts[i % stage.posts.length]}
          rest={stage.rest}
          verb={stage.verb}
          tool={stage.tool}
          matched={apt == null || d.aptitude === apt}
          walks={i < walkers}
          onClick={() => onHero(d.id)}
        />
      ))}
      {loiterers.map((d, i) => (
        <CrewActor
          key={d.id}
          d={d}
          post={stage.posts[i % stage.posts.length]}
          rest={stage.rest}
          verb="guard"
          tool=""
          matched
          walks={i < walkers}
          onClick={() => onHero(d.id)}
        />
      ))}
      {Array.from({ length: free }).map((_, i) => {
        const post = stage.posts[(visual.workers.length + i) % stage.posts.length];
        return (
          <button
            key={`slot-${i}`}
            type="button"
            className="crew-slot"
            style={{ left: `${post}%` }}
            onClick={onAssign}
            title={apt ? `Empty post — wants ${APTITUDE_LABEL[apt]}` : "Empty post"}
          >
            <span className="slot-ring" aria-hidden />
            <span className="slot-apt" aria-hidden>
              {apt ? APTITUDE_ICON[apt] : "＋"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CrewActor({
  d,
  post,
  rest,
  verb,
  tool,
  matched,
  walks,
  onClick,
}: {
  d: Dweller;
  post: number;
  rest: number;
  verb: string;
  tool: string;
  matched: boolean;
  walks: boolean;
  onClick: () => void;
}) {
  const seed = hash01(d.id);
  const hurt = !d.downed && d.hp < dwellerMaxHp(d);
  return (
    <div
      className="crew-actor"
      data-verb={verb}
      data-walks={walks ? "1" : "0"}
      data-down={d.downed ? "1" : "0"}
      data-match={matched ? "1" : "0"}
      style={
        {
          "--post": `${post}%`,
          "--rest": `${rest}%`,
          // Negative delay starts each worker part-way through their loop, so a
          // freshly-rendered room is already mid-shift rather than in lockstep.
          "--delay": `-${(seed * 9).toFixed(2)}s`,
          "--loop": `${(7.5 + seed * 3).toFixed(2)}s`,
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        className={`crew-body apt-${d.aptitude}`}
        draggable={!d.downed}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", d.id);
          beginHeroDrag(d);
        }}
        onDragEnd={endHeroDrag}
        onClick={onClick}
        title={`${d.name} · ${TIERS[d.tier].name} Lv${d.level}${d.downed ? " · DOWNED" : hurt ? " · wounded" : ""}${matched ? "" : " · wrong aptitude for this room"}`}
      >
        <img className="crew-portrait" src={TIER_PORTRAIT[d.tier]} alt="" loading="lazy" />
        {tool && (
          <span className="crew-tool" aria-hidden>
            {tool}
          </span>
        )}
        {!matched && (
          <span className="crew-mismatch" aria-hidden title="wrong aptitude">
            {APTITUDE_ICON[d.aptitude]}
          </span>
        )}
        {d.downed && (
          <span className="crew-cross" aria-hidden>
            ✚
          </span>
        )}
        {hurt && (
          <span className="crew-hp" aria-hidden>
            <i style={{ width: `${hpFrac(d) * 100}%` }} />
          </span>
        )}
        <span className="crew-shadow" aria-hidden />
      </button>
    </div>
  );
}

/**
 * The room's output, physically present on the floor and growing with storage.
 * This IS the collect button — there is no detached bubble, because a pile of
 * ore you can sweep up is a better affordance than a floating icon, and it
 * keeps the player's eye inside the room.
 */
function YieldPile({ visual, onCollect }: { visual: RoomVisual; onCollect: (el: HTMLElement | null) => void }) {
  const stage = STAGE[visual.type];
  if (stage.yieldKind === "none" || visual.storeCap <= 0) return null;
  const ready = visual.stored >= 1;
  const UNITS = 7;
  return (
    <button
      type="button"
      className="ch-yield"
      data-kind={stage.yieldKind}
      data-ready={ready ? "1" : "0"}
      disabled={!ready}
      style={{ left: `${stage.yieldAt.x}%`, top: `${stage.yieldAt.y}%`, "--s": stage.yieldAt.s } as React.CSSProperties}
      onClick={(e) => onCollect(e.currentTarget)}
      title={ready ? `Collect ${formatNum(visual.stored)}` : "Nothing to collect yet"}
      aria-label={ready ? `Collect ${formatNum(visual.stored)}` : "Store is empty"}
    >
      {Array.from({ length: UNITS }).map((_, i) => (
        // Each unit fades and rises in as the store fills — opacity clamps to
        // 0..1 on its own, so the whole reveal is one calc and no JS per frame.
        <span key={i} className="yield-unit" style={{ "--i": i, "--n": UNITS } as React.CSSProperties} />
      ))}
      <span className="yield-count">{ready ? `+${formatNum(visual.stored)}` : ""}</span>
      <span className="yield-hand" aria-hidden />
    </button>
  );
}

/**
 * Everything the room throws into the air. Emitter count is budgeted by the
 * motion tier; the *kind* is chosen by state, so an incident doesn't need its
 * own overlay component — it swaps the particle flavour and the light.
 */
function AmbientLayer({ visual, emitters }: { visual: RoomVisual; emitters: number }) {
  if (emitters === 0) return null;
  const stage = STAGE[visual.type];
  const kind = visual.flags.incident
    ? "smoke"
    : visual.flags.upgrading
      ? "grit"
      : visual.flags.damaged
        ? "grit"
        : visual.activity > 0
          ? stage.motes
          : "dust";
  // A quiet room still breathes, it just breathes less.
  const n = visual.activity > 0 || visual.flags.incident ? emitters : Math.ceil(emitters / 3);
  return (
    <div className="ch-air" data-kind={kind} aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className="mote" style={{ "--i": i, "--n": n } as React.CSSProperties} />
      ))}
      {visual.incidentKind === "vermin" && (
        <>
          <span className="rat r1" />
          <span className="rat r2" />
        </>
      )}
      {visual.incidentKind === "cavein" && (
        <>
          <span className="rubble b1" />
          <span className="rubble b2" />
          <span className="rubble b3" />
        </>
      )}
    </div>
  );
}

/** Hung signs — the room's state, carved rather than rendered in neon. */
function Signs({ badges }: { badges: RoomBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="ch-signs">
      {badges.slice(0, 4).map((b, i) => (
        <span
          key={b.key}
          className="sign"
          data-tone={b.tone}
          data-urgent={b.urgent ? "1" : "0"}
          style={{ "--i": i } as React.CSSProperties}
          title={b.label}
          role="img"
          aria-label={b.label}
        >
          <i className="sign-rope" aria-hidden />
          <span className="sign-face">
            <span className="sign-icon" aria-hidden>
              {b.icon}
            </span>
            {b.text && <span className="sign-text">{b.text}</span>}
          </span>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- dig site

/**
 * An undug room, in the grid where it will one day stand. Making "locked" a
 * chamber state rather than a button in a menu below is the difference between
 * a build list and a place with room to grow — the player sees the empty rock
 * and the marked-out plan every time they look at the stronghold.
 */
export function DigSite({
  type,
  state,
  actions,
}: {
  type: RoomType;
  state: GameState;
  actions: Actions;
}) {
  const def = ROOMS[type];
  const cost = ROOMS[type].buildCost;
  const taken = Boolean(def.unique && state.rooms.some((r) => r.type === type));
  const affordable = state.gold >= cost;
  if (taken) return null;
  return (
    <button
      type="button"
      className="chamber dig-site"
      data-room={type}
      data-state="locked"
      data-tier={1}
      disabled={!affordable}
      title={def.description}
      onClick={() => {
        actions.build(type);
        sfx.build();
      }}
    >
      <span className="ch-shell" aria-hidden>
        <span className="dig-rock" />
        <span className="dig-marks" />
        <span className="dig-tools" />
      </span>
      <span className="dig-body">
        <span className="dig-icon">{def.icon}</span>
        <b className="dig-name">{def.name}</b>
        <span className="dig-cost" data-afford={affordable ? "1" : "0"}>
          ⛏ dig · 🪙 {formatNum(cost)}
        </span>
      </span>
      <span className="dig-dust" aria-hidden>
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}

/** Re-exported so App doesn't need to reach into the engine for this one number. */
export { upgradeCost };
