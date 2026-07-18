import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyWarChestFunding,
  assignDweller,
  autoStaff,
  buildRoom,
  claimRaid,
  collectAll,
  collectRoom,
  deriveStats,
  loadState,
  recruitDweller,
  rushRoom,
  saveState,
  startRaid,
  tick,
  unassignDweller,
  upgradeRoom,
} from "../game/engine";
import { STORAGE_KEY } from "../game/config";
import type { GameState, RoomType } from "../game/types";

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

  const actions = useMemo(
    () => ({
      recruit: () => wrap(recruitDweller),
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
      clearError: () => setError(null),
      reset: () => {
        localStorage.removeItem(STORAGE_KEY);
        setState(loadState());
      },
    }),
    [wrap],
  );

  return { state, stats, error, now, actions };
}
