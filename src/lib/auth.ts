import { Magic } from "magic-sdk";
import type { Signer } from "ethers";
import { hasMagicKey, magicKey } from "./config";
import { signerFromEip1193 } from "./ua";

let magicSingleton: Magic | null = null;

export function getMagic(): Magic | null {
  if (!hasMagicKey()) return null;
  if (!magicSingleton) {
    magicSingleton = new Magic(magicKey!, {
      network: "mainnet",
    });
  }
  return magicSingleton;
}

export type AuthSession = {
  method: "magic" | "injected";
  address: string;
  signer: Signer;
  email?: string;
};

export async function loginWithMagicEmail(email: string): Promise<AuthSession> {
  const magic = getMagic();
  if (!magic) {
    throw new Error("Magic key not configured (VITE_MAGIC_PUBLISHABLE_KEY)");
  }

  const loggedIn = await magic.user.isLoggedIn();
  if (!loggedIn) {
    await magic.auth.loginWithEmailOTP({ email });
  }

  const { address, signer } = await signerFromEip1193(magic.rpcProvider);
  let userEmail = email;
  try {
    const info = await magic.user.getInfo();
    userEmail = info.email ?? email;
  } catch {
    // ignore
  }

  return { method: "magic", address, signer, email: userEmail };
}

export async function restoreMagicSession(): Promise<AuthSession | null> {
  const magic = getMagic();
  if (!magic) return null;
  try {
    const loggedIn = await magic.user.isLoggedIn();
    if (!loggedIn) return null;
    const { address, signer } = await signerFromEip1193(magic.rpcProvider);
    const info = await magic.user.getInfo();
    return {
      method: "magic",
      address,
      signer,
      email: info.email ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function logoutMagic() {
  const magic = getMagic();
  if (magic) {
    try {
      await magic.user.logout();
    } catch {
      // ignore
    }
  }
}

export async function connectInjectedWallet(): Promise<AuthSession> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eth = (window as any).ethereum;
  if (!eth) {
    throw new Error("No browser wallet found. Install MetaMask or use Magic email login.");
  }
  const { address, signer } = await signerFromEip1193(eth);
  return { method: "injected", address, signer };
}
