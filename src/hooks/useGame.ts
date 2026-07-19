import { useCallback, useEffect, useMemo, useState } from "react";
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
  grantGearItem,
  grantGladiator,
  healAll,
  healDweller,
  loadState,
  openLunchbox,
  recruitDweller,
  rerollMarket,
  rushRoom,
  saveState,
  selectAllIdle,
  sellGearItem,
  sellHero,
  startRaid,
  tick,
  toggleSquad,
  unassignDweller,
  unequipGear,
  upgradeGear,
  upgradeRoom,
  type FightResult,
  type Pull,
} from "../game/engine";
import { STORAGE_KEY } from "../game/config";
import type { GameState, GearSlot, RoomType, Tier } from "../game/types";

export function useGame() {
  const [state, setState] = useState<GameState>(() => loadState());
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

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
      sellHero: (id: string) => wrap((s) => sellHero(s, id)),
      sellGear: (gearItemId: string) => wrap((s) => sellGearItem(s, gearItemId)),
      clearError: () => setError(null),
      // Dev/admin escape hatch — shallow-merge an arbitrary state patch.
      devPatch: (patch: Partial<GameState>) => wrap((s) => ({ ...s, ...patch })),
      reset: () => {
        localStorage.removeItem(STORAGE_KEY);
        setState(loadState());
      },
    }),
    [wrap],
  );

  return { state, stats, error, now, actions, openLunchbox: openBox, fightBoss: fight };
}
