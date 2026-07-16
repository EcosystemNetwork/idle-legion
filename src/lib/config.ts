export const particleConfig = {
  projectId: import.meta.env.VITE_PARTICLE_PROJECT_ID as string | undefined,
  clientKey: import.meta.env.VITE_PARTICLE_CLIENT_KEY as string | undefined,
  appId: import.meta.env.VITE_PARTICLE_APP_ID as string | undefined,
};

export const magicKey = import.meta.env.VITE_MAGIC_PUBLISHABLE_KEY as
  | string
  | undefined;

export const warChestReceiver = import.meta.env.VITE_WAR_CHEST_RECEIVER as
  | string
  | undefined;

export function hasParticleKeys(): boolean {
  return Boolean(
    particleConfig.projectId &&
      particleConfig.clientKey &&
      particleConfig.appId,
  );
}

export function hasMagicKey(): boolean {
  return Boolean(magicKey && magicKey.length > 10);
}

/** Arbitrum One USDT — primary settlement asset for War Chest */
export const ARBITRUM_USDT = {
  chainId: 42161,
  address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
} as const;

export const DEFAULT_FUND_AMOUNT = "0.1"; // human-readable USDT
