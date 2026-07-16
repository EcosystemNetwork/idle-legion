import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyWarChestFunding,
  buyUnit,
  claimRaid,
  deriveStats,
  loadState,
  saveState,
  startRaid,
  tick,
  upgradeBarracks,
} from "../game/engine";
import type { GameState, UnitId } from "../game/types";

export function useGame() {
  const [state, setState] = useState<GameState>(() => loadState());
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

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
      buy: (id: UnitId) => wrap((s) => buyUnit(s, id)),
      upgradeBarracks: () => wrap((s) => upgradeBarracks(s)),
      startRaid: (missionId: string) => wrap((s) => startRaid(s, missionId)),
      claimRaid: () => wrap((s) => claimRaid(s)),
      applyFunding: (usd: number, txId: string | null) =>
        wrap((s) => applyWarChestFunding(s, usd, txId)),
      clearError: () => setError(null),
      reset: () => {
        localStorage.removeItem("idle-legion-v1");
        setState(loadState());
      },
    }),
    [wrap],
  );

  return { state, stats, error, now, actions };
}
