import { createHash } from "node:crypto";
import type {
  StorageProgramListItem,
  StorageProgramResponse,
} from "./types.js";

export type StorageEncoding = "json" | "binary";
export type StorageLocation = "onchain" | "ipfs";
export type StorageAclMode = "owner" | "public" | "restricted";

export interface StorageGroupPermissions {
  members: string[];
  permissions: Array<"read" | "write" | "delete">;
}

export interface StorageProgramAcl {
  mode: StorageAclMode;
  allowed?: string[];
  blacklisted?: string[];
  groups?: Record<string, StorageGroupPermissions>;
}

export type StorageProgramOperation =
  | "CREATE_STORAGE_PROGRAM"
  | "WRITE_STORAGE"
  | "READ_STORAGE"
  | "UPDATE_ACCESS_CONTROL"
  | "DELETE_STORAGE_PROGRAM";

export interface StorageProgramPayload {
  operation: StorageProgramOperation;
  storageAddress: string;
  programName?: string;
  encoding?: StorageEncoding;
  data?: Record<string, unknown> | string;
  acl?: StorageProgramAcl;
  salt?: string;
  metadata?: Record<string, unknown>;
  storageLocation?: StorageLocation;
}

export const STORAGE_PROGRAM_CONSTANTS = Object.freeze({
  MAX_SIZE_BYTES: 1_048_576,
  PRICING_CHUNK_BYTES: 10_240,
  FEE_PER_CHUNK: 1_000_000_000n,
  MAX_JSON_NESTING_DEPTH: 64,
});

/** Send a public Storage Program node call and preserve its result envelope. */
async function nodeCall<T>(
  rpcUrl: string,
  message: string,
  data: Record<string, unknown>,
): Promise<{ result: number; response: T; extra?: unknown }> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "nodeCall",
      params: [{ message, data, muid: `storage-${Date.now()}` }],
    }),
  });
  if (!response.ok) {
    throw new Error(`Demos storage RPC failed with HTTP ${response.status}`);
  }
  return await response.json() as { result: number; response: T; extra?: unknown };
}

// REVIEW: Keep this builder byte-compatible with the node and established SDK;
// every wire-format change needs a fixed compatibility vector.
/** Static builders and public reads for Demos Storage Programs. */
export class StorageProgram {
  /**
   * Derive the canonical native storage address.
   * This byte sequence must remain compatible with the node's derivation.
   */
  static deriveStorageAddress(
    deployerAddress: string,
    programName: string,
    nonce: number,
    salt = "",
  ): string {
    const hash = createHash("sha256")
      .update(`${deployerAddress}:${programName}:${nonce}:${salt}`)
      .digest("hex");
    return `stor-${hash.slice(0, 40)}`;
  }

  /** Build a CREATE_STORAGE_PROGRAM payload without signing or broadcasting. */
  static createStorageProgram(
    deployerAddress: string,
    programName: string,
    data: Record<string, unknown> | string,
    encoding: StorageEncoding = "json",
    acl?: Partial<StorageProgramAcl>,
    options?: {
      nonce: number;
      salt?: string;
      metadata?: Record<string, unknown>;
      storageLocation?: StorageLocation;
    },
  ): StorageProgramPayload {
    if (options?.nonce === undefined) {
      throw new Error("nonce is required for storage program creation");
    }
    const salt = options.salt ?? "";
    return {
      operation: "CREATE_STORAGE_PROGRAM",
      storageAddress: this.deriveStorageAddress(
        deployerAddress,
        programName,
        options.nonce,
        salt,
      ),
      programName,
      encoding,
      data,
      acl: {
        mode: acl?.mode ?? "owner",
        allowed: acl?.allowed,
        blacklisted: acl?.blacklisted,
        groups: acl?.groups,
      },
      salt: options.salt,
      metadata: options.metadata,
      storageLocation: options.storageLocation ?? "onchain",
    };
  }

  /** Build a WRITE_STORAGE payload without signing or broadcasting. */
  static writeStorage(
    storageAddress: string,
    data: Record<string, unknown> | string,
    encoding: StorageEncoding = "json",
  ): StorageProgramPayload {
    return { operation: "WRITE_STORAGE", storageAddress, data, encoding };
  }

  /** Build a READ_STORAGE payload without making a network request. */
  static readStorage(storageAddress: string): StorageProgramPayload {
    return { operation: "READ_STORAGE", storageAddress };
  }

  /** Return an access-control value allowing public reads. */
  static publicACL(): StorageProgramAcl {
    return { mode: "public" };
  }

  /** Return an owner-only access-control value. */
  static privateACL(): StorageProgramAcl {
    return { mode: "owner" };
  }

  /** Read a Storage Program by its native address, or `null` when absent. */
  static async getByAddress(
    rpcUrl: string,
    storageAddress: string,
    identity?: string,
  ): Promise<StorageProgramResponse | null> {
    const result = await nodeCall<StorageProgramResponse | null>(
      rpcUrl,
      "getStorageProgram",
      { storageAddress, requesterAddress: identity },
    );
    return result.result === 200 ? result.response : null;
  }

  /** Search public Storage Program metadata by name. */
  static async searchByName(
    rpcUrl: string,
    nameQuery: string,
    options?: {
      exactMatch?: boolean;
      limit?: number;
      offset?: number;
      identity?: string;
    },
  ): Promise<StorageProgramListItem[]> {
    const result = await nodeCall<StorageProgramListItem[]>(
      rpcUrl,
      "searchStoragePrograms",
      {
        query: nameQuery,
        options: {
          limit: options?.limit,
          offset: options?.offset,
          exactMatch: options?.exactMatch,
        },
        requesterAddress: options?.identity,
      },
    );
    return result.result === 200 && Array.isArray(result.response)
      ? result.response
      : [];
  }
}

export type { StorageProgramListItem, StorageProgramResponse } from "./types.js";
