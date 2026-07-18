import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyWarChestFunding,
  assignDweller,
  autoStaff,
  buildRoom,
  claimObjective,
  claimRaid,
  collectAll,
  collectRoom,
  deriveStats,
  equipGear,
  fightBoss,
  buySlave,
  loadState,
  openLunchbox,
  recruitDweller,
  rerollMarket,
  rushRoom,
  saveState,
  startRaid,
  tick,
  unassignDweller,
  unequipGear,
  upgradeRoom,
  type FightResult,
  type Pull,
} from "../game/engine";
import { STORAGE_KEY } from "../game/config";
import type { GameState, GearSlot, RoomType } from "../game/types";

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
      rush: (roomId: string) => wrap((s) => rushRoom(s, roomId)),
      startRaid: (missionId: string) => wrap((s) => startRaid(s, missionId)),
      claimRaid: () => wrap(claimRaid),
      applyFunding: (usd: number, txId: string | null) =>
        wrap((s) => applyWarChestFunding(s, usd, txId)),
      equip: (dwellerId: string, gearItemId: string) =>
        wrap((s) => equipGear(s, dwellerId, gearItemId)),
      unequip: (dwellerId: string, slot: GearSlot) =>
        wrap((s) => unequipGear(s, dwellerId, slot)),
      claimObjective: (objId: string) => wrap((s) => claimObjective(s, objId)),
      clearError: () => setError(null),
      reset: () => {
        localStorage.removeItem(STORAGE_KEY);
        setState(loadState());
      },
    }),
    [wrap],
  );

  return { state, stats, error, now, actions, openLunchbox: openBox, fightBoss: fight };
}
