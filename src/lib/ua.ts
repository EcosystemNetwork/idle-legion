// The Particle UA SDK + ethers are the two heaviest dependencies in the app and
// most players never open the on-chain Bazaar, so both are loaded on demand
// rather than at import time. Types are `import type` (erased at compile time,
// zero runtime cost); every value import happens inside an async call below.
import type {
  IAssetsResponse,
  ITransaction,
  UniversalAccount as UniversalAccountType,
} from "@particle-network/universal-account-sdk";
import type { BrowserProvider, Signer } from "ethers";
import {
  ARBITRUM_USDT,
  DEFAULT_FUND_AMOUNT,
  hasParticleKeys,
  particleConfig,
  warChestReceiver,
} from "./config";

export async function createUniversalAccount(ownerAddress: string): Promise<UniversalAccountType> {
  if (!hasParticleKeys()) {
    throw new Error(
      "Missing Particle keys. Set VITE_PARTICLE_PROJECT_ID, VITE_PARTICLE_CLIENT_KEY, VITE_PARTICLE_APP_ID in .env",
    );
  }

  const { UniversalAccount } = await import("@particle-network/universal-account-sdk");

  // EIP-7702 mode: EOA is upgraded in place — same address, chain-abstracted balance
  return new UniversalAccount({
    projectId: particleConfig.projectId!,
    projectClientKey: particleConfig.clientKey!,
    projectAppUuid: particleConfig.appId!,
    smartAccountOptions: {
      name: "UNIVERSAL",
      version: "2.0.1",
      ownerAddress,
      useEIP7702: true,
    },
    tradeConfig: {
      slippageBps: 100,
    },
  });
}

export async function fetchPrimaryAssets(
  ownerAddress: string,
): Promise<IAssetsResponse> {
  const ua = await createUniversalAccount(ownerAddress);
  return ua.getPrimaryAssets();
}

export async function getSmartAccountAddress(
  ownerAddress: string,
): Promise<string | undefined> {
  const ua = await createUniversalAccount(ownerAddress);
  const opts = await ua.getSmartAccountOptions();
  // In 7702 mode the EOA is the account; still surface smart account fields if present
  return opts.smartAccountAddress ?? ownerAddress;
}

/**
 * Cross-chain value move via Universal Accounts:
 * Sources Primary Assets from ANY supported chain and delivers USDT on Arbitrum.
 * This is the required "at least one cross-chain operation moving value via UA".
 */
export async function fundWarChestOnArbitrum(params: {
  ownerAddress: string;
  signer: Signer;
  amount?: string;
  receiver?: string;
}): Promise<{ transactionId: string; amount: string; explorerUrl: string }> {
  const amount = params.amount ?? DEFAULT_FUND_AMOUNT;
  const receiver =
    params.receiver ??
    warChestReceiver ??
    params.ownerAddress;

  // Both heavy SDKs load here, in parallel, only once a real transfer is made.
  const [{ CHAIN_ID }, { getBytes }] = await Promise.all([
    import("@particle-network/universal-account-sdk"),
    import("ethers"),
  ]);

  const ua = await createUniversalAccount(params.ownerAddress);

  // Transfer USDT on Arbitrum — UA routes liquidity from whatever chain holds funds
  const transaction: ITransaction = await ua.createTransferTransaction({
    token: {
      chainId: CHAIN_ID.ARBITRUM_MAINNET_ONE,
      address: ARBITRUM_USDT.address,
    },
    amount,
    receiver,
  });

  // EIP-7702 authorizations when the SDK provides them
  let authorizations: { userOpHash: string; signature: string }[] | undefined;
  try {
    const authPayload = await ua.getEIP7702Auth([
      CHAIN_ID.ARBITRUM_MAINNET_ONE,
      CHAIN_ID.ETHEREUM_MAINNET,
      CHAIN_ID.BASE_MAINNET,
    ]);
    if (Array.isArray(authPayload) && authPayload.length > 0) {
      authorizations = [];
      for (const item of authPayload as Array<{
        userOpHash?: string;
        hash?: string;
        message?: string;
      }>) {
        const hash = item.userOpHash ?? item.hash ?? item.message;
        if (!hash) continue;
        const sig = await params.signer.signMessage(getBytes(hash));
        authorizations.push({ userOpHash: hash, signature: sig });
      }
    }
  } catch {
    // Auth optional if already delegated; transfer can still succeed
    authorizations = undefined;
  }

  const rootSig = await params.signer.signMessage(getBytes(transaction.rootHash));
  const result = await ua.sendTransaction(
    transaction,
    rootSig,
    authorizations,
  );

  const transactionId =
    result?.transactionId ??
    result?.id ??
    transaction.transactionId;

  return {
    transactionId,
    amount,
    explorerUrl: `https://universalx.app/activity/details?id=${transactionId}`,
  };
}

export async function signerFromEip1193(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eip1193: any,
): Promise<{ address: string; signer: Signer; provider: BrowserProvider }> {
  const { BrowserProvider: Provider } = await import("ethers");
  const provider = new Provider(eip1193);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { address, signer, provider };
}
