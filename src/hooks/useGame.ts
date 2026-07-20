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
  loadState,
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
import { STORAGE_KEY } from "../game/config";
import type { CombatClass, GameState, GearSlot, LandKind, RoomType, Tier } from "../game/types";
import {
  loadCloud,
  localSavedAt,
  markCloudSynced,
  saveCloud,
  setCloudIdentity,
  type Identity,
} from "../lib/cloudSave";

// How often we mirror the local save up to InsForge. Coarse on purpose: the 4Hz
// local save is the fast path; the cloud is a durable backup, not per-frame.
const CLOUD_PUSH_MS = 15_000;

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

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      setState((s) => {
        const next = tick(s, Date.now());
        saveState(next);
        return next;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  // ---- Cloud persistence (InsForge) ------------------------------------------
  // Adopt cloud state that's newer than this device's last push, else seed the
  // cloud from local. Runs once at boot and again whenever identity changes
  // (see syncIdentity) — signing in switches the player key, so we reconcile
  // against the (possibly cross-device) save stored under the new key.
  const hydratedRef = useRef(false);

  const reconcileCloud = useCallback(async () => {
    const cloud = await loadCloud();
    if (cloud && cloud.savedAt > localSavedAt()) {
      // Cloud is fresher than anything this device wrote — adopt it. Round-trip
      // through local save/load so it gets the same merge + offline-catch-up as
      // a normal boot, then mark ourselves in sync with that savedAt.
      saveState(cloud.state);
      setState(loadState());
      markCloudSynced(cloud.savedAt);
    } else {
      // Local is authoritative (fresh account, offline device, or first run) —
      // push it up so the cloud reflects it.
      await saveCloud(stateRef.current);
    }
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    void reconcileCloud();
  }, [reconcileCloud]);

  // Coarse periodic mirror + a final push when the tab is hidden/closed so the
  // tail of a session isn't lost. Gated on hydration so we never push local
  // over a not-yet-loaded fresher cloud save.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (hydratedRef.current) void saveCloud(stateRef.current);
    }, CLOUD_PUSH_MS);
    const onHide = () => {
      if (hydratedRef.current) void saveCloud(stateRef.current);
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onHide();
    });
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

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

  const wrap = useCallback((fn: (s: GameState) => GameState) => {
    setError(null);
    try {
      setState((s) => {
        const next = fn(tick(s, Date.now()));
        saveState(next);
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Functions that must return a result (gacha reveal / battle log).
  const openBox = useCallback((): Pull | null => {
    setError(null);
    try {
      const { state: next, pull } = openLunchbox(tick(state, Date.now()));
      saveState(next);
      setState(next);
      return pull;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [state]);

  const fight = useCallback((): FightResult | null => {
    setError(null);
    try {
      const { state: next, result } = fightBoss(tick(state, Date.now()));
      saveState(next);
      setState(next);
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [state]);

  // Strike the shared World Boss — returns the hit for combat juice.
  const hitBoss = useCallback((): WorldBossHit | null => {
    setError(null);
    try {
      const { state: next, hit } = hitWorldBoss(tick(state, Date.now()));
      saveState(next);
      setState(next);
      return hit;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [state]);

  // LIVE-mode strike: spend stamina/XP + roll damage, but pay NOTHING locally
  // (the server owns the shared boss + the trustless payout). Returns the damage.
  const strikeArena = useCallback((enemyClass?: CombatClass): number | null => {
    setError(null);
    try {
      const { state: next, damage } = arenaStrike(tick(state, Date.now()), enemyClass);
      saveState(next);
      setState(next);
      return damage;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [state]);

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
        localStorage.removeItem(STORAGE_KEY);
        const fresh = loadState();
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
