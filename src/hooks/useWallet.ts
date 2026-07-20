import { useCallback, useEffect, useRef, useState } from "react";
import type { IAsset } from "@particle-network/universal-account-sdk";
import {
  connectInjectedWallet,
  loginWithMagicEmail,
  logoutMagic,
  restoreMagicSession,
  type AuthSession,
} from "../lib/auth";
import { hasMagicKey, hasParticleKeys } from "../lib/config";
import {
  fetchPrimaryAssets,
  fundWarChestOnArbitrum,
  getSmartAccountAddress,
} from "../lib/ua";

export function useWallet() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalUsd, setTotalUsd] = useState<number | null>(null);
  const [assets, setAssets] = useState<IAsset[]>([]);
  const [uaAddress, setUaAddress] = useState<string | null>(null);
  // `error` is React state, so it is still stale in the same tick a call fails —
  // the Treasury's transaction sheet needs the message *synchronously* to tell a
  // user rejection apart from a genuine failure. The ref is the truth source.
  const errorRef = useRef<string | null>(null);
  const [lastTx, setLastTx] = useState<{
    id: string;
    amount: string;
    url: string;
  } | null>(null);

  const caps = {
    magic: hasMagicKey(),
    particle: hasParticleKeys(),
  };

  const refreshBalances = useCallback(async (address: string) => {
    if (!hasParticleKeys()) {
      setTotalUsd(null);
      setAssets([]);
      return;
    }
    try {
      const primary = await fetchPrimaryAssets(address);
      setTotalUsd(primary.totalAmountInUSD);
      setAssets(primary.assets ?? []);
      const sa = await getSmartAccountAddress(address);
      setUaAddress(sa ?? address);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await restoreMagicSession();
      if (cancelled || !restored) return;
      setSession(restored);
      await refreshBalances(restored.address);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshBalances]);

  const run = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    errorRef.current = null;
    setError(null);
    try {
      return await fn();
    } catch (e) {
      const msg = (e as Error).message;
      errorRef.current = msg;
      setError(msg);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const loginMagic = (email: string) =>
    run(async () => {
      const s = await loginWithMagicEmail(email);
      setSession(s);
      await refreshBalances(s.address);
      return s;
    });

  const loginInjected = () =>
    run(async () => {
      const s = await connectInjectedWallet();
      setSession(s);
      await refreshBalances(s.address);
      return s;
    });

  const logout = () =>
    run(async () => {
      if (session?.method === "magic") await logoutMagic();
      setSession(null);
      setTotalUsd(null);
      setAssets([]);
      setUaAddress(null);
    });

  /**
   * Cross-chain fund War Chest → USDT on Arbitrum via Universal Accounts EIP-7702
   */
  const fundWarChest = (amount = "0.1") =>
    run(async () => {
      if (!session) throw new Error("Connect a wallet first");
      if (!hasParticleKeys()) {
        throw new Error("Particle keys missing — cannot run UA transfer");
      }
      const result = await fundWarChestOnArbitrum({
        ownerAddress: session.address,
        signer: session.signer,
        amount,
      });
      setLastTx({
        id: result.transactionId,
        amount: result.amount,
        url: result.explorerUrl,
      });
      await refreshBalances(session.address);
      return result;
    });

  return {
    session,
    busy,
    error,
    setError,
    totalUsd,
    assets,
    uaAddress,
    lastTx,
    caps,
    /** Synchronous read of the most recent failure, for transaction flows. */
    readError: () => errorRef.current,
    loginMagic,
    loginInjected,
    logout,
    fundWarChest,
    refreshBalances: () =>
      session ? refreshBalances(session.address) : Promise.resolve(),
  };
}
