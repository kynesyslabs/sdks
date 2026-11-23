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

// Finality and storage proof reads. Each type is the answer body of a node
// call as kynesyslabs/node serves it from v1.0.0-rc.14; the file:line
// references are to node commit 4877499a. The SDK does not verify them: they
// are what one RPC claims.

/** A block as hashed: sha256(contentBytes) is `hash`. Node finalityShared.ts:16-20. */
export interface BlockBytes {
  number: number;
  hash: string;
  contentBytes: string;
}

/** A block with its certificate. Node finalityShared.ts:23-27. */
export interface SignedHeader extends BlockBytes {
  round: number | null;
  signedMessage: string | null;
  signatures: Record<string, string>;
}

/** A transaction as hashed, with its signature. Node finalityShared.ts:41-46. */
export interface TransactionBytes {
  hash: string;
  contentBytes: string;
  signature: { type: string; data: string; domain?: string } | null;
  ed25519_signature: string | null;
}

/** `getChainIdentity`. Node getChainIdentity.ts:40-44, sharedState.ts:447. */
export interface ChainIdentity {
  chainId: number | null;
  genesisHash: string;
  genesisDataHash: string;
}

/**
 * `getFinalizedHead` when answered 200: the head's certificate without its
 * bytes. Node getFinalizedHead.ts:42-46 and 142-161. A 503 node_not_synced
 * body has `number` and `hash` null.
 */
export interface FinalizedHead extends Omit<SignedHeader, "contentBytes"> {
  timestamp: number | null;
  ageSeconds: number | null;
  nodeSynced: boolean;
  checkedThroughBlock: number;
  signatureCount: number;
  committee: string[] | null;
  committeeRule: "bound_committee" | "eligible_pool" | null;
  threshold: number | null;
}

/** `getBlockSegment`: headers `from..to`. Node getBlockSegment.ts:81-86. */
export interface BlockSegment {
  from: number;
  to: number;
  head: number;
  headers: SignedHeader[];
}

/** One validator in a set record. Node model/entities/ValidatorSetSnapshots.ts:15-20. */
export interface ValidatorSetEntry {
  identity: string;
  stake: string;
  status: string | null;
  validAt: number | null;
}

/** `getValidatorSet`: the set after `blockNumber`. Node getValidatorSet.ts:52-57. */
export interface ValidatorSet {
  blockNumber: number;
  effectiveFrom: number;
  setHash: string;
  validators: ValidatorSetEntry[];
}

/**
 * `getTransactionStatus`. Node chainTypes.ts:21-26 and
 * getTransactionStatus.ts:32-42, 63-79. `checkedThroughBlock` is absent
 * from older nodes. `resultCommittedInBlock` is null until the block that
 * commits the result is searched, and absent when no block commits it
 * (before the finalityProofs fork, genesis, older nodes).
 */
export interface TransactionStatus {
  state: "pending" | "included" | "failed" | "unknown";
  blockNumber?: number;
  code?: string;
  message?: string;
  checkedThroughBlock?: number;
  resultCommittedInBlock?: number | null;
}

/** `getTransactionProof`. Node getTransactionProof.ts:93-104. */
export interface TransactionProof {
  hash: string;
  blockNumber: number;
  leafIndex: number;
  treeSize: number;
  leaf: string;
  auditPath: string[];
  committedIn: number;
  inclusionBlock: BlockBytes;
  commitBlock: SignedHeader;
  tx: TransactionBytes;
}

/** A storage program as its tree leaf commits it. Node storageRecord.ts:62-74. */
export interface StorageProgramRecord {
  storageAddress: string;
  owner: string;
  programName: string;
  encoding: string;
  dataHash: string;
  sizeBytes: number;
  aclHash: string;
  metadataHash: string;
  createdByTx: string;
  lastModifiedByTx: string;
  isDeleted: boolean;
}

/** End of a sparse Merkle path. Node crypto/merkle/sparse.ts:38-40. */
export type SparseTerminal =
  | { kind: "leaf"; key: string; valueHash: string }
  | { kind: "empty" };

/** One program's path; `record: null` when absent. Node storageRoot.ts:137-142. */
export interface StorageProgramProof {
  storageAddress: string;
  record: StorageProgramRecord | null;
  siblings: string[];
  terminal: SparseTerminal;
}

/** `getStorageProof`. Node getStorageProof.ts:143-148. */
export interface StorageProof {
  anchor: SignedHeader;
  anchorParent: BlockBytes;
  asOfBlock: number;
  proofs: StorageProgramProof[];
}

/** `getStorageProgramLimits`. Node getStorageProgramLimits.ts:35-45. */
export interface StorageProgramLimits {
  maxAddressesPerProof: number;
  historyBlocks: number;
  maxDataBytes: number;
  measuredOver: string;
  maxJsonDepth: number;
  appliesFromBlock: number;
  maxProgramSizeBytes: number;
  pricingChunkBytes: number;
  feePerChunk: string;
}
