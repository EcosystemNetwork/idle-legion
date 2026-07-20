import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyWarChestFunding,
  assignDweller,
  autoStaff,
  buildRoom,
  claimDaily,
  claimObjective,
  claimRaid,
  clearLevelUps,
  clearOfflineSummary,
  clearRaidReport,
  clearSquad,
  collectAll,
  collectRoom,
  collectWarChest,
  descend,
  deriveStats,
  equipGear,
  fightBoss,
  fuseGear,
  buySlave,
  claimBankYield,
  claimLand,
  clearDuelResult,
  clearWorldBossReward,
  arenaStrike,
  duel,
  duelAgainst,
  grantArenaReward,
  grantBundle,
  grantGearItem,
  grantGladiator,
  healAll,
  healDweller,
  hitWorldBoss,
  lastLoadOutcome,
  loadState,
  resetSave,
  openLunchbox,
  recruitDweller,
  rerollMarket,
  rushRoom,
  saveState,
  selectAllIdle,
  sellGearItem,
  sellHero,
  stakeLegion,
  startRaid,
  summonHero,
  swapGoldForLegion,
  swapLegionForGold,
  tick,
  toggleSquad,
  unassignDweller,
  unequipGear,
  unstakeLegion,
  upgradeGear,
  upgradeLand,
  upgradeRoom,
  type DuelOpponent,
  type FightResult,
  type Pull,
  type WorldBossHit,
} from "../game/engine";
import type { CombatClass, GameState, GearSlot, LandKind, RoomType, Tier } from "../game/types";
import {
  loadCloud,
  localSavedAt,
  markCloudSynced,
  saveCloud,
  setCloudIdentity,
  type CloudSave,
  type Identity,
} from "../lib/cloudSave";

// How often we mirror the local save up to InsForge. Coarse on purpose: the 4Hz
// local save is the fast path; the cloud is a durable backup, not per-frame.
const CLOUD_PUSH_MS = 15_000;

/** How often idle drift is committed to localStorage (actions save instantly). */
const LOCAL_SAVE_MS = 10_000;

export function useGame() {
  const [state, setState] = useState<GameState>(() => loadState());
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Always-current snapshot of state for the async cloud pushers (which fire on
  // timers / pagehide, outside React's render, and must not close over a stale
  // value or force a re-subscribe every tick).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Whether the welcome-back (offline earnings) report has already been shown
  // this session — see adoptCloud.
  const offlineShownRef = useRef(state.offlineSummary != null);
  useEffect(() => {
    if (state.offlineSummary) offlineShownRef.current = true;
  }, [state.offlineSummary]);

  // The 4Hz tick advances the sim only. It deliberately does NOT persist:
  // serializing + hashing the whole save 4x/second cost up to 5.6ms/s of main
  // thread on a big roster. Idle accrual is fully reconstructable from lastTick
  // by applyOffline() on load, and every player ACTION saves immediately via
  // wrap(), so the only thing a coarse timer needs to cover is the idle drift.
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      setState((s) => tick(s, Date.now()));
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  // Low-frequency safety save + a guaranteed flush when the tab goes away.
  useEffect(() => {
    const id = window.setInterval(() => saveState(stateRef.current), LOCAL_SAVE_MS);
    const flush = () => saveState(stateRef.current);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush(); // don't lose the tail on unmount
    };
  }, []);

  // ---- Cloud persistence (InsForge) ------------------------------------------
  // Adopt cloud state that's newer than this device's last push, else seed the
  // cloud from local. Runs once at boot and again whenever identity changes
  // (see syncIdentity) — signing in switches the player key, so we reconcile
  // against the (possibly cross-device) save stored under the new key.
  const hydratedRef = useRef(false);
  // Monotonic token: several reconciles can be in flight (boot + identity
  // change + StrictMode double-mount) and only the newest may apply its result.
  const reconcileGen = useRef(0);

  /**
   * True when local state came from a real save. A state produced by a FAILURE
   * path (unreadable save, blocked storage) must never be promoted to the cloud
   * — that is what turned a local glitch into permanent account loss.
   */
  const localIsTrustworthy = useCallback(() => {
    const outcome = lastLoadOutcome();
    return outcome === "loaded" || outcome === "recovered";
  }, []);

  /**
   * Adopt a cloud save: round-trip through local save/load so it gets the same
   * merge + offline catch-up as a normal boot. The welcome-back report is shown
   * at most ONCE per session — adopting re-runs offline catch-up, and a second
   * report seconds after the player dismissed the first reads as a modal that
   * refuses to stay closed. The earnings still apply; only the report is dropped.
   */
  const adoptCloud = useCallback((cloud: CloudSave) => {
    saveState(cloud.state);
    const next = loadState();
    setState(offlineShownRef.current ? clearOfflineSummary(next) : next);
    markCloudSynced(cloud.savedAt);
  }, []);

  const reconcileCloud = useCallback(async () => {
    const gen = ++reconcileGen.current;
    const cloud = await loadCloud();
    if (gen !== reconcileGen.current) return; // superseded by a newer reconcile

    if (cloud && cloud.savedAt > localSavedAt()) {
      // Cloud is fresher than anything this device synced for this key — adopt.
      adoptCloud(cloud);
    } else if (localIsTrustworthy()) {
      // Local is authoritative — push it up so the cloud reflects it.
      await saveCloud(stateRef.current);
    } else if (cloud) {
      // We have nothing trustworthy locally but the cloud has something: take it
      // rather than overwriting it with a blank account.
      adoptCloud(cloud);
    }
    hydratedRef.current = true;
  }, [localIsTrustworthy, adoptCloud]);

  useEffect(() => {
    void reconcileCloud();
  }, [reconcileCloud]);

  // Coarse periodic mirror + a final push when the tab is hidden/closed so the
  // tail of a session isn't lost. Gated on hydration so we never push local
  // over a not-yet-loaded fresher cloud save.
  useEffect(() => {
    const push = () => {
      // Never mirror a state we don't trust (see localIsTrustworthy).
      if (hydratedRef.current && localIsTrustworthy()) void saveCloud(stateRef.current);
    };
    const id = window.setInterval(push, CLOUD_PUSH_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") push();
    };
    window.addEventListener("pagehide", push);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pagehide", push);
      // Previously an inline arrow, so this listener could never be removed —
      // every remount leaked one and duplicated the push on each tab hide.
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [localIsTrustworthy]);

  // Called by the app when the player's identity changes (wallet connect /
  // logout). Repoints the player key and reconciles the save under it.
  const syncIdentity = useCallback(
    (id: Identity) => {
      setCloudIdentity(id);
      void reconcileCloud();
    },
    [reconcileCloud],
  );

  const stats = useMemo(() => deriveStats(state), [state]);

  /**
   * Apply an engine action.
   *
   * The work happens OUTSIDE the setState updater on purpose. Engine actions
   * throw for validation ("Not enough gold"), and React only sometimes evaluates
   * an updater eagerly — when it doesn't, the throw escaped this try/catch,
   * surfaced during render, and with no error boundary blanked the whole app.
   * Updaters must also be pure, and this one was calling saveState().
   *
   * stateRef is advanced synchronously so two actions dispatched in the same
   * render pass chain off each other instead of both branching from a stale
   * snapshot (which silently discarded the first).
   */
  const wrap = useCallback((fn: (s: GameState) => GameState) => {
    setError(null);
    try {
      const next = fn(tick(stateRef.current, Date.now()));
      stateRef.current = next;
      saveState(next);
      setState(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  /** Same contract as wrap(), for actions that also return a result to the UI. */
  const wrapResult = useCallback(<T,>(fn: (s: GameState) => { state: GameState; result: T }): T | null => {
    setError(null);
    try {
      const { state: next, result } = fn(tick(stateRef.current, Date.now()));
      stateRef.current = next;
      saveState(next);
      setState(next);
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, []);

  // Functions that must return a result (gacha reveal / battle log).
  const openBox = useCallback(
    (): Pull | null =>
      wrapResult((s) => {
        const { state: next, pull } = openLunchbox(s);
        return { state: next, result: pull };
      }),
    [wrapResult],
  );

  const fight = useCallback((): FightResult | null => wrapResult(fightBoss), [wrapResult]);

  // Strike the shared World Boss — returns the hit for combat juice.
  const hitBoss = useCallback(
    (): WorldBossHit | null =>
      wrapResult((s) => {
        const { state: next, hit } = hitWorldBoss(s);
        return { state: next, result: hit };
      }),
    [wrapResult],
  );

  // LIVE-mode strike: spend stamina/XP + roll damage, but pay NOTHING locally
  // (the server owns the shared boss + the trustless payout). Returns the damage.
  const strikeArena = useCallback(
    (enemyClass?: CombatClass): number | null =>
      wrapResult((s) => {
        const { state: next, damage } = arenaStrike(s, enemyClass);
        return { state: next, result: damage };
      }),
    [wrapResult],
  );

  const actions = useMemo(
    () => ({
      recruit: () => wrap(recruitDweller),
      buySlave: (offerId: string) => wrap((s) => buySlave(s, offerId)),
      rerollMarket: () => wrap(rerollMarket),
      build: (type: RoomType) => wrap((s) => buildRoom(s, type)),
      upgrade: (roomId: string) => wrap((s) => upgradeRoom(s, roomId)),
      assign: (dwellerId: string, roomId: string) =>
        wrap((s) => assignDweller(s, dwellerId, roomId)),
      unassign: (dwellerId: string) => wrap((s) => unassignDweller(s, dwellerId)),
      autoStaff: (roomId: string) => wrap((s) => autoStaff(s, roomId)),
      collect: (roomId: string) => wrap((s) => collectRoom(s, roomId)),
      collectAll: () => wrap(collectAll),
      collectWarChest: () => wrap(collectWarChest),
      rush: (roomId: string) => wrap((s) => rushRoom(s, roomId)),
      startRaid: (missionId: string) => wrap((s) => startRaid(s, missionId)),
      claimRaid: () => wrap(claimRaid),
      clearRaidReport: () => wrap(clearRaidReport),
      heal: (id: string) => wrap((s) => healDweller(s, id)),
      healAll: () => wrap(healAll),
      upgradeGear: (gearItemId: string) => wrap((s) => upgradeGear(s, gearItemId)),
      fuseGear: (targetId: string, sacrificeId: string) => wrap((s) => fuseGear(s, targetId, sacrificeId)),
      claimDaily: () => wrap(claimDaily),
      applyFunding: (usd: number, txId: string | null) =>
        wrap((s) => applyWarChestFunding(s, usd, txId)),
      equip: (dwellerId: string, gearItemId: string) =>
        wrap((s) => equipGear(s, dwellerId, gearItemId)),
      unequip: (dwellerId: string, slot: GearSlot) =>
        wrap((s) => unequipGear(s, dwellerId, slot)),
      claimObjective: (objId: string) => wrap((s) => claimObjective(s, objId)),
      toggleSquad: (id: string) => wrap((s) => toggleSquad(s, id)),
      selectAllIdle: () => wrap(selectAllIdle),
      clearSquad: () => wrap(clearSquad),
      descend: () => wrap(descend),
      clearOffline: () => wrap(clearOfflineSummary),
      clearLevelUps: () => wrap(clearLevelUps),
      grantGladiator: (tier: Tier) => wrap((s) => grantGladiator(s, tier)),
      grantGear: (defId: string) => wrap((s) => grantGearItem(s, defId)),
      grantBundle: (b: { gold?: number; lunchboxes?: number; gear?: string[]; champions?: number }) =>
        wrap((s) => grantBundle(s, b)),
      sellHero: (id: string) => wrap((s) => sellHero(s, id)),
      sellGear: (gearItemId: string) => wrap((s) => sellGearItem(s, gearItemId)),
      // --- deep economy: summoning, DEX, bank, land, world boss, PvP ---
      summon: (aId: string, bId: string) => wrap((s) => summonHero(s, aId, bId)),
      swapGoldForLegion: (goldIn: number) => wrap((s) => swapGoldForLegion(s, goldIn)),
      swapLegionForGold: (legionIn: number) => wrap((s) => swapLegionForGold(s, legionIn)),
      stakeLegion: (amt: number) => wrap((s) => stakeLegion(s, amt)),
      unstakeLegion: (amt: number) => wrap((s) => unstakeLegion(s, amt)),
      claimBankYield: () => wrap((s) => claimBankYield(s)),
      claimLand: (kind: LandKind) => wrap((s) => claimLand(s, kind)),
      upgradeLand: (plotId: string) => wrap((s) => upgradeLand(s, plotId)),
      clearWorldBossReward: () => wrap(clearWorldBossReward),
      duel: (oppId: number) => wrap((s) => duel(s, oppId)),
      duelReal: (opp: DuelOpponent) => wrap((s) => duelAgainst(s, opp)),
      clearDuelResult: () => wrap(clearDuelResult),
      grantArenaReward: (r: { gold?: number; legion?: number; lunchboxes?: number }) =>
        wrap((s) => grantArenaReward(s, r)),
      clearError: () => setError(null),
      // Dev/admin escape hatch — shallow-merge an arbitrary state patch.
      devPatch: (patch: Partial<GameState>) => wrap((s) => ({ ...s, ...patch })),
      reset: () => {
        // resetSave clears the backup slot too — otherwise the next load would
        // "recover" the save the player just asked to delete.
        const fresh = resetSave();
        stateRef.current = fresh;
        setState(fresh);
        // Overwrite the cloud copy so a reset roams too (fresh state, new stamp).
        void saveCloud(fresh);
      },
    }),
    [wrap],
  );

  return {
    state,
    stats,
    error,
    now,
    actions,
    syncIdentity,
    openLunchbox: openBox,
    fightBoss: fight,
    hitWorldBoss: hitBoss,
    strikeArena,
  };
}
