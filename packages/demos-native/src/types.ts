export type Amount = number | string | bigint;

export interface TransactionFee {
  network_fee: Amount;
  rpc_fee: Amount;
  additional_fee: Amount;
  rpc_address: string | null;
  [key: string]: unknown;
}

export interface GcrEdit {
  type: string;
  account?: string;
  target?: string;
  operation?: string;
  amount?: Amount;
  txhash?: string;
  isRollback?: boolean;
  context?: unknown;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TransactionContent {
  type: string;
  from: string;
  to: string;
  amount: Amount;
  data: [string, unknown];
  nonce: number;
  timestamp: number;
  transaction_fee: TransactionFee;
  from_ed25519_address?: string;
  gcr_edits?: GcrEdit[];
  [key: string]: unknown;
}

export interface Transaction {
  content: TransactionContent;
  signature: { type: "ed25519"; data: string } | null;
  hash: string;
  status: string;
  blockNumber: number | null;
  [key: string]: unknown;
}

export interface RpcResponse<T = unknown> {
  result: number;
  response: T;
  require_reply?: boolean;
  extra?: unknown;
}

export interface ConfirmedTransactionData {
  valid: boolean;
  message?: string;
  transaction: Transaction;
  [key: string]: unknown;
}

export type ValidityResponse = RpcResponse<{
  data: ConfirmedTransactionData;
  [key: string]: unknown;
}>;

export interface NetworkInfo {
  forks?: {
    osDenomination?: { activated?: boolean; [key: string]: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AddressInfo {
  balance: bigint;
  nonce?: number;
  [key: string]: unknown;
}

export interface StorageProgramResponse {
  success: boolean;
  storageAddress?: string;
  owner?: string;
  programName?: string;
  encoding?: "json" | "binary";
  data?: Record<string, unknown> | string | null;
  metadata?: Record<string, unknown> | null;
  storageLocation?: string;
  sizeBytes?: number;
  createdAt?: string;
  updatedAt?: string;
  error?: string;
  errorCode?: string;
}

export interface StorageProgramListItem {
  storageAddress: string;
  programName: string;
  encoding: "json" | "binary";
  sizeBytes: number;
  storageLocation: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemosAccount {
  pubkey?: string;
  [key: string]: unknown;
}
