declare module "@particle-network/universal-account-sdk" {
  export enum CHAIN_ID {
    SOLANA_MAINNET = 101,
    ETHEREUM_MAINNET = 1,
    BSC_MAINNET = 56,
    BASE_MAINNET = 8453,
    XLAYER_MAINNET = 196,
    ARBITRUM_MAINNET_ONE = 42161,
  }

  export enum SUPPORTED_TOKEN_TYPE {
    ETH = "eth",
    USDT = "usdt",
    USDC = "usdc",
    BNB = "bnb",
    SOL = "sol",
  }

  export interface IBasicToken {
    chainId: number;
    address: string;
  }

  export interface ITransferTransaction {
    token: IBasicToken;
    amount: string;
    receiver: string;
  }

  export interface ISmartAccountOptions {
    name: string;
    version: string;
    ownerAddress: string;
    smartAccountAddress?: string;
    solanaSmartAccountAddress?: string;
    options?: unknown;
    useEIP7702?: boolean;
  }

  export interface ITradeConfig {
    slippageBps?: number;
    usePrimaryTokens?: SUPPORTED_TOKEN_TYPE[];
  }

  export interface IUniversalAccountConfig {
    projectId: string;
    projectClientKey: string;
    projectAppUuid: string;
    smartAccountOptions?: Partial<ISmartAccountOptions> & {
      ownerAddress?: string;
      useEIP7702?: boolean;
    };
    tradeConfig?: ITradeConfig;
    rpcUrl?: string;
  }

  export interface IAsset {
    tokenType: SUPPORTED_TOKEN_TYPE;
    price: number;
    amount: number;
    amountInUSD: number;
    chainAggregation: Array<{
      token: unknown;
      amount: number;
      amountInUSD: number;
      rawAmount: number;
    }>;
  }

  export interface IAssetsResponse {
    assets: IAsset[];
    totalAmountInUSD: number;
  }

  export interface ITransaction {
    type: string;
    mode: string;
    sender: string;
    receiver: string;
    transactionId: string;
    rootHash: string;
    userOps: unknown[];
    [key: string]: unknown;
  }

  export interface EIP7702Authorization {
    userOpHash: string;
    signature: string;
  }

  export class UniversalAccount {
    constructor(config: IUniversalAccountConfig);
    getPrimaryAssets(): Promise<IAssetsResponse>;
    createTransferTransaction(payload: ITransferTransaction): Promise<ITransaction>;
    getSmartAccountOptions(): Promise<ISmartAccountOptions>;
    sendTransaction(
      transaction: ITransaction,
      signature: string,
      authorizations?: EIP7702Authorization[],
    ): Promise<{ transactionId?: string; id?: string; [key: string]: unknown }>;
    getEIP7702Auth(chainIds: number[]): Promise<unknown>;
    getEIP7702Deployments(): Promise<unknown>;
  }

  export class UniversalError extends Error {
    readonly code: number;
    readonly data?: unknown;
  }
}
