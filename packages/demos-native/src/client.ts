import {
  createHash,
  hkdfSync,
} from "node:crypto";
import forge from "node-forge";
import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  STORAGE_PROGRAM_CONSTANTS,
  type StorageProgramPayload,
} from "./storage.js";
import type {
  AddressInfo,
  Amount,
  GcrEdit,
  NetworkInfo,
  RpcResponse,
  StorageProgramResponse,
  Transaction,
  TransactionContent,
  ValidityResponse,
} from "./types.js";

const OS_PER_DEM = 1_000_000_000n;
const FAILURE_CACHE_MS = 30_000;
const RETRYABLE_STATUS = new Set([502, 503, 504]);

class NonRetryableRpcError extends Error {}

type NativeBuffer = forge.pki.ed25519.NativeBuffer;
type KeyPair = { publicKey: NativeBuffer; privateKey: NativeBuffer };

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function with0x(bytes: Uint8Array): string {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOs(value: Amount): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string") return BigInt(value);
  const [whole, fraction = ""] = value.toString().split(".");
  if (fraction.length > 9) throw new Error("DEM amount exceeds 9 decimal places");
  const result = BigInt(`${whole}${fraction.padEnd(9, "0")}`);
  if (result < 0n) throw new Error("negative amounts are not allowed");
  return result;
}

function preForkAmount(value: Amount): number {
  return typeof value === "number" ? value : Number(parseOs(value) / OS_PER_DEM);
}

function postForkAmount(value: Amount): string {
  return parseOs(value).toString();
}

function transformEdit(edit: GcrEdit, postFork: boolean): GcrEdit {
  const convert = postFork ? postForkAmount : preForkAmount;
  if (edit.type === "balance" && edit.amount !== undefined) {
    return { ...edit, amount: convert(edit.amount) };
  }
  if (
    edit.type === "escrow" &&
    edit.data?.amount !== undefined &&
    edit.data.amount !== null
  ) {
    return {
      ...edit,
      data: { ...edit.data, amount: convert(edit.data.amount as Amount) },
    };
  }
  if (postFork && edit.type === "validatorStake" && edit.amount !== undefined) {
    return { ...edit, amount: postForkAmount(edit.amount) };
  }
  return edit;
}

/**
 * Serialize transaction content in the exact pre- or post-denomination-fork
 * wire format used by Demos nodes.
 */
export function serializeTransactionContent(
  content: TransactionContent,
  postFork: boolean,
): string {
  const convert = postFork ? postForkAmount : preForkAmount;
  const transformed: TransactionContent = { ...content };
  if (content.amount !== undefined && content.amount !== null) {
    transformed.amount = convert(content.amount);
  }
  if (content.transaction_fee) {
    transformed.transaction_fee = {
      ...content.transaction_fee,
      network_fee: convert(content.transaction_fee.network_fee),
      rpc_fee: convert(content.transaction_fee.rpc_fee),
      additional_fee: convert(content.transaction_fee.additional_fee),
    };
  }
  if (Array.isArray(content.gcr_edits)) {
    transformed.gcr_edits = content.gcr_edits.map((edit) =>
      transformEdit(edit, postFork)
    );
  }
  return JSON.stringify(transformed);
}

function emptyTransaction(): Transaction {
  return {
    content: {
      type: "",
      from: "",
      to: "",
      amount: 0,
      data: ["", ""],
      nonce: 0,
      timestamp: 0,
      transaction_fee: {
        network_fee: 0,
        rpc_fee: 0,
        additional_fee: 0,
        rpc_address: null,
      },
    },
    signature: null,
    hash: "",
    status: "",
    blockNumber: null,
  };
}

function ensure0x(value: string): string {
  return value.startsWith("0x") ? value : `0x${value}`;
}

function storageFeeDem(payload: StorageProgramPayload): number {
  const data = payload.data;
  let sizeBytes = 0;
  if (data !== undefined) {
    sizeBytes = payload.encoding === "binary"
      ? Math.ceil((data as string).length * 3 / 4)
      : new TextEncoder().encode(JSON.stringify(data)).length;
  }
  return Math.max(
    1,
    Math.ceil(sizeBytes / STORAGE_PROGRAM_CONSTANTS.PRICING_CHUNK_BYTES),
  );
}

function createGcrEdits(transaction: Transaction): GcrEdit[] {
  const content = transaction.content;
  const sender = ensure0x(content.from_ed25519_address ?? "");
  const edits: GcrEdit[] = [];

  if (content.type === "native") {
    const payload = content.data[1] as {
      nativeOperation?: string;
      args?: unknown[];
    };
    if (payload.nativeOperation === "send" && payload.args?.length) {
      const [to, amount] = payload.args;
      edits.push(
        {
          type: "balance",
          operation: "remove",
          isRollback: false,
          account: sender,
          txhash: transaction.hash,
          amount: amount as Amount,
        },
        {
          type: "balance",
          operation: "add",
          isRollback: false,
          account: ensure0x(String(to)),
          txhash: transaction.hash,
          amount: amount as Amount,
        },
      );
    }
  } else if (content.type === "storageProgram") {
    const payload = content.data[1] as StorageProgramPayload;
    if (
      payload.operation === "CREATE_STORAGE_PROGRAM" ||
      payload.operation === "WRITE_STORAGE"
    ) {
      edits.push({
        type: "balance",
        operation: "remove",
        isRollback: false,
        account: sender,
        txhash: transaction.hash,
        amount: storageFeeDem(payload),
      });
    }
    if (payload.operation !== "READ_STORAGE") {
      edits.push({
        type: "storageProgram",
        target: payload.storageAddress,
        isRollback: false,
        txhash: transaction.hash,
        context: {
          operation: payload.operation,
          sender,
          data: {
            variables: payload,
            metadata: payload.metadata ?? null,
          },
        },
      });
    }
  } else if (content.type === "web2Request") {
    edits.push({
      type: "assign",
      account: sender,
      context: "web2",
      txhash: transaction.hash,
      isRollback: false,
    });
  }

  if (content.type !== "identity" && content.type !== "d402_payment") {
    edits.push({
      type: "balance",
      account: sender,
      operation: "remove",
      amount: 1,
      txhash: transaction.hash,
      isRollback: false,
    });
  }
  edits.push({
    type: "nonce",
    operation: "add",
    account: sender,
    amount: 1,
    txhash: transaction.hash,
    isRollback: false,
  });
  return edits;
}

function deriveKeyPair(secret: string | Uint8Array): KeyPair {
  let source: string | Uint8Array | null = null;
  if (typeof secret === "string") {
    const trimmed = secret.trim();
    source = validateMnemonic(trimmed, wordlist)
      ? trimmed
      : mnemonicToSeedSync(trimmed);
    if (trimmed.length !== 128) source = trimmed;
  } else if (secret.length !== 128) {
    source = secret;
  }

  const master = source === null
    ? secret as Uint8Array
    : Buffer.from(
      createHash("sha3-512").update(source).digest("hex"),
      "utf8",
    );
  const derived = new Uint8Array(
    hkdfSync("sha256", master, "master seed", "ed25519", 32),
  );
  const legacySeedString = Array.from(derived).toString();
  const ed25519Seed = createHash("sha256")
    .update(legacySeedString)
    .digest();
  return forge.pki.ed25519.generateKeyPair({ seed: ed25519Seed });
}

class Ed25519Authority {
  private keyPair: KeyPair | null = null;

  connect(secret: string | Uint8Array): void {
    this.keyPair = deriveKeyPair(secret);
  }

  get connected(): boolean {
    return this.keyPair !== null;
  }

  get address(): string {
    if (!this.keyPair) throw new Error("Wallet not connected");
    return with0x(this.keyPair.publicKey as Uint8Array);
  }

  async getIdentity(algorithm: string): Promise<KeyPair> {
    if (algorithm !== "ed25519") {
      throw new Error("@kynesyslabs/demos-native supports only ed25519");
    }
    if (!this.keyPair) throw new Error("Wallet not connected");
    return this.keyPair;
  }

  async sign(
    algorithm: string,
    data: Uint8Array,
  ): Promise<{
    algorithm: "ed25519";
    signature: Uint8Array;
    message: Uint8Array;
    publicKey: NativeBuffer;
  }> {
    if (algorithm !== "ed25519") {
      throw new Error("@kynesyslabs/demos-native supports only ed25519");
    }
    if (!this.keyPair) throw new Error("Wallet not connected");
    const signature = forge.pki.ed25519.sign({
      message: new TextDecoder().decode(data),
      encoding: "utf8",
      privateKey: this.keyPair.privateKey,
    });
    return {
      algorithm: "ed25519",
      signature,
      message: data,
      publicKey: this.keyPair.publicKey,
    };
  }
}

interface RpcRequest {
  method: string;
  params: unknown[];
}

interface Web2StartOptions {
  headers?: Record<string, string>;
  payload?: unknown;
  authorization?: string;
  nonce?: number;
}

// REVIEW: DAHR support intentionally exposes only the DACS create/start/anchor
// path; broaden it only with compatibility vectors and an explicit review.
/** A wallet-bound DAHR session used to obtain and anchor a Web2 response. */
export class Web2Proxy {
  constructor(
    readonly sessionId: string,
    private readonly demos: Demos,
  ) {}

  /**
   * Run one HTTP(S) request through DAHR and anchor its response evidence.
   * Requires the owning `Demos` client to remain connected with a wallet.
   * Throws on unsafe URLs, transport failures, invalid evidence or rejection.
   */
  async startProxy(input: {
    url: string;
    method: string;
    options?: Web2StartOptions;
  }): Promise<Record<string, unknown>> {
    const parsed = new URL(input.url.trim());
    if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
      throw new Error("Only http(s) DAHR target URLs are allowed");
    }
    if (parsed.username || parsed.password || !parsed.hostname) {
      throw new Error("DAHR target URLs cannot contain credentials");
    }
    parsed.hash = "";
    if (
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443")
    ) parsed.port = "";

    const headers: Record<string, string> = Object.assign(
      Object.create(null) as Record<string, string>,
      input.options?.headers,
    );
    let payload: string | undefined;
    if (input.options?.payload !== undefined) {
      payload = typeof input.options.payload === "string"
        ? input.options.payload
        : JSON.stringify(input.options.payload);
    }
    const web2Request = {
      raw: {
        action: "startProxy",
        parameters: [],
        method: input.method,
        url: parsed.toString(),
        headers,
        stage: { origin: { identity: "", connection_url: "" } },
      },
      result: null,
      hash: "",
      signature: { type: "ed25519", data: "" },
    };
    const response = await this.demos.call("web2ProxyRequest", {
      web2Request,
      sessionId: this.sessionId,
      payload,
      authorization: input.options?.authorization,
    }) as unknown;
    if (!isRecord(response) || response.result !== 200) {
      throw new Error(
        `Demos DAHR request failed with RPC result ${
          isRecord(response) ? String(response.result) : "unknown"
        }`,
        { cause: isRecord(response) ? response.response : response },
      );
    }
    const proxyResponse = response.response;
    const result = isRecord(proxyResponse) ? proxyResponse.response : undefined;
    if (
      !isRecord(result) ||
      !Number.isInteger(result.status) ||
      (result.status as number) < 100 ||
      (result.status as number) > 599 ||
      !isRecord(result.headers) ||
      typeof result.responseHash !== "string" ||
      !result.responseHash ||
      typeof result.responseHeadersHash !== "string" ||
      !result.responseHeadersHash ||
      typeof result.statusText !== "string" ||
      (result.requestHash !== undefined && typeof result.requestHash !== "string")
    ) {
      throw new TypeError("Demos DAHR request returned invalid response evidence");
    }

    const transaction = emptyTransaction();
    transaction.content.to = this.demos.getAddress();
    transaction.content.type = "web2Request";
    transaction.content.data = [
      "web2Request",
      {
        message: {
          sessionId: this.sessionId,
          payload: "",
          authorization: "",
          web2Request: {
            ...web2Request,
            result: {
              sessionId: this.sessionId,
              targetUrl: web2Request.raw.url,
              timestamp: Date.now(),
              status: result.status,
              headers: result.headers,
              responseHash: result.responseHash,
              responseHeadersHash: result.responseHeadersHash,
              ...(result.requestHash ? { requestHash: result.requestHash } : {}),
              statusText: result.statusText,
            },
          },
        },
      },
    ];
    transaction.content.timestamp = Date.now();
    transaction.content.nonce = input.options?.nonce ??
      (await this.demos.getAddressNonce(this.demos.getAddress())) + 1;
    const signed = await this.demos.sign(transaction);
    const validity = await this.demos.confirm(signed);
    const broadcast = await this.demos.broadcast(validity);
    if (broadcast.result !== 200) {
      throw new Error(
        `Demos DAHR anchor broadcast failed with RPC result ${broadcast.result}`,
        { cause: broadcast.response },
      );
    }
    return {
      ...result,
      txHash: validity.response.data.transaction.hash,
    };
  }
}

// REVIEW: This compatibility client is deliberately limited to the DACS-used
// native, Storage Program, identity-read and DAHR surface.
/** Dependency-minimal Node ESM client for DACS operations on Demos. */
export class Demos {
  readonly algorithm = "ed25519" as const;
  readonly crypto = new Ed25519Authority();
  connected = false;
  private rpcUrl: string | null = null;
  private networkInfo: NetworkInfo | null = null;
  private networkInfoRpc: string | null = null;
  private networkFailureAt = 0;

  get walletConnected(): boolean {
    return this.crypto.connected;
  }

  /** Storage Program transaction signing and authenticated native reads. */
  readonly storagePrograms = {
    sign: async (
      payload: StorageProgramPayload,
      options?: { nonce?: number },
    ): Promise<Transaction> => {
      if (!this.walletConnected) throw new Error("Wallet not connected");
      if (!payload.storageAddress) throw new Error("Storage address not found");
      const nonce = options?.nonce ??
        (await this.getAddressNonce(this.getAddress())) + 1;
      const transaction = emptyTransaction();
      transaction.content.to = payload.storageAddress;
      transaction.content.type = "storageProgram";
      transaction.content.nonce = nonce;
      transaction.content.data = ["storageProgram", payload];
      return await this.sign(transaction);
    },
    read: async (address: string): Promise<StorageProgramResponse> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.walletConnected) Object.assign(headers, await this.authHeaders());
      const response = await fetch(
        `${this.requireRpc()}/storage-program/${encodeURIComponent(address)}`,
        { headers },
      );
      if (!response.ok) {
        const error = new Error(`Demos storage read failed with HTTP ${response.status}`) as Error & {
          response?: { status: number };
        };
        error.response = { status: response.status };
        throw error;
      }
      return await response.json() as StorageProgramResponse;
    },
  };

  /** Compatibility namespace for transaction confirmation and broadcast. */
  readonly tx = {
    confirm: async (
      transaction: Transaction,
      demos: Demos = this,
    ): Promise<ValidityResponse> => await demos.confirm(transaction),
    broadcast: async (
      validity: ValidityResponse,
      demos: Demos = this,
    ): Promise<RpcResponse> => await demos.broadcast(validity),
  };

  /** Compatibility namespace for creating wallet-authenticated DAHR sessions. */
  readonly web2 = {
    createDahr: async (): Promise<Web2Proxy> => {
      if (!this.walletConnected) throw new Error("Wallet not connected");
      const response = await this.call("web2ProxyRequest", {
        web2Request: {
          raw: {
            action: "create",
            parameters: [],
            method: "GET",
            url: "",
            headers: {},
            stage: { origin: { identity: "", connection_url: "" } },
          },
          result: null,
          hash: "",
          signature: { type: "ed25519", data: "" },
        },
      }) as unknown;
      if (!isRecord(response) || response.result !== 200) {
        throw new Error(
          `Demos DAHR session creation failed with RPC result ${
            isRecord(response) ? String(response.result) : "unknown"
          }`,
          { cause: isRecord(response) ? response.response : response },
        );
      }
      const inner = response.response;
      const dahr = isRecord(inner) ? inner.dahr : undefined;
      if (!isRecord(dahr) || typeof dahr.sessionId !== "string" || !dahr.sessionId) {
        throw new TypeError("Demos DAHR session creation returned no valid session ID");
      }
      return new Web2Proxy(dahr.sessionId, this);
    },
  };

  /** Connect to an HTTP(S) Demos RPC after a successful liveness request. */
  async connect(rpcUrl: string): Promise<boolean> {
    const response = await fetch(rpcUrl);
    if (!response.ok) throw new Error(`Demos RPC failed with HTTP ${response.status}`);
    if (this.rpcUrl !== rpcUrl) {
      this.networkInfo = null;
      this.networkInfoRpc = null;
      this.networkFailureAt = 0;
    }
    this.rpcUrl = rpcUrl;
    this.connected = true;
    return true;
  }

  /** Derive and connect the legacy-compatible Ed25519 wallet identity. */
  async connectWallet(secret: string | Uint8Array): Promise<string> {
    if (!secret) throw new Error("Master seed is required");
    this.crypto.connect(secret);
    return this.getAddress();
  }

  /** Return the connected wallet's 0x-prefixed Ed25519 address. */
  getAddress(): string {
    return this.crypto.address;
  }

  /** Sign an exact UTF-8 protocol proof and return raw lowercase-hex Ed25519. */
  async signMessage(message: string): Promise<string> {
    if (typeof message !== "string" || message.length === 0) {
      throw new TypeError("Message to sign must be a non-empty string");
    }
    const signed = await this.crypto.sign(
      "ed25519",
      new TextEncoder().encode(message),
    );
    return Buffer.from(signed.signature).toString("hex");
  }

  /** Return the connected Ed25519 address through the legacy async surface. */
  async getEd25519Address(): Promise<string> {
    return this.getAddress();
  }

  private requireRpc(): string {
    if (!this.connected || !this.rpcUrl) throw new Error("Demos RPC not connected");
    return this.rpcUrl;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const identity = `ed25519:${this.getAddress()}`;
    const timestamp = Date.now().toString();
    const digest = sha256Hex(`${identity}:${timestamp}`);
    const signed = await this.crypto.sign(
      "ed25519",
      new TextEncoder().encode(digest),
    );
    return { identity, timestamp, signature: with0x(signed.signature) };
  }

  private async post(
    request: RpcRequest,
    authenticated: boolean,
  ): Promise<RpcResponse> {
    const rpc = this.requireRpc();
    const body = JSON.stringify(request);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(authenticated ? await this.authHeaders() : {}),
    };
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.postOnce(rpc, headers, body);
      } catch (error) {
        if (error instanceof NonRetryableRpcError) throw error;
        lastError = error;
        if (attempt === 3) break;
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Demos RPC failed");
  }

  private async postOnce(
    rpc: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<RpcResponse> {
    const response = await fetch(rpc, { method: "POST", headers, body });
    if (!response.ok) {
      const message = `Demos RPC failed with HTTP ${response.status}`;
      if (RETRYABLE_STATUS.has(response.status)) throw new Error(message);
      throw new NonRetryableRpcError(message);
    }
    try {
      return await response.json() as RpcResponse;
    } catch {
      throw new NonRetryableRpcError(
        "Demos RPC returned an invalid JSON response",
      );
    }
  }

  /**
   * Send a raw RPC request, optionally authenticated by the connected wallet.
   * Preserves the established result-envelope behavior on terminal failures.
   */
  async rpcCall(
    request: RpcRequest,
    authenticated = false,
    retries = 0,
    sleepTime = 250,
    allowedErrorCodes: number[] = [],
  ): Promise<RpcResponse> {
    try {
      const response = await this.post(request, authenticated);
      if (
        response.result !== 200 &&
        !allowedErrorCodes.includes(response.result) &&
        retries > 0
      ) {
        await new Promise((resolve) => setTimeout(resolve, sleepTime));
        return await this.rpcCall(
          request,
          authenticated,
          retries - 1,
          sleepTime,
          allowedErrorCodes,
        );
      }
      return response;
    } catch (error) {
      return { result: 500, response: error, require_reply: false, extra: null };
    }
  }

  /**
   * Send a Demos transmission call and unwrap public `nodeCall` responses.
   * Non-node calls require a connected wallet for authenticated headers.
   */
  async call(
    method: string,
    message: unknown,
    data: unknown = {},
    extra: unknown = "",
  ): Promise<unknown> {
    const request: RpcRequest = {
      method,
      params: [{
        type: method,
        message,
        sender: null,
        receiver: null,
        timestamp: null,
        data,
        extra,
      }],
    };
    try {
      const response = await this.post(request, method !== "nodeCall");
      return method === "nodeCall" ? response.response : response;
    } catch (error) {
      return { result: 500, response: error, require_reply: false, extra: null };
    }
  }

  /** Run an unauthenticated, read-only node call. */
  async nodeCall(message: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return await this.call("nodeCall", message, args);
  }

  /** Read a block by its non-negative height. */
  async getBlockByNumber(blockNumber: number): Promise<unknown> {
    return await this.nodeCall("getBlockByNumber", { blockNumber });
  }

  /** Read a transaction by its Demos transaction hash. */
  async getTxByHash(hash: string): Promise<unknown> {
    return await this.nodeCall("getTxByHash", { hash });
  }

  /**
   * Read an address's transaction-history page and fail closed on a malformed
   * or failed RPC response.
   */
  async getTransactionHistory(
    address: string,
    type: string = "all",
    options: { start?: number; limit?: number } = {},
  ): Promise<unknown[]> {
    const history = await this.nodeCall("getTransactionHistory", {
      address,
      type,
      ...options,
    });
    if (!Array.isArray(history)) {
      throw new TypeError("Demos RPC returned no valid transaction history");
    }
    return history;
  }

  /**
   * Read account information, returning balance as bigint OS units.
   * Throws when the RPC response cannot be authenticated structurally.
   */
  async getAddressInfo(address: string): Promise<AddressInfo | null> {
    const info = await this.nodeCall("getAddressInfo", { address });
    if (info === null) return null;
    if (
      typeof info !== "object" ||
      Array.isArray(info) ||
      !Object.hasOwn(info, "balance")
    ) {
      throw new Error("Demos RPC returned no valid address information");
    }
    const rawBalance = (info as Record<string, unknown>).balance;
    let balance: bigint;
    if (rawBalance === null || rawBalance === undefined) {
      balance = 0n;
    } else if (typeof rawBalance === "bigint" && rawBalance >= 0n) {
      balance = rawBalance;
    } else if (
      typeof rawBalance === "number" &&
      Number.isSafeInteger(rawBalance) &&
      rawBalance >= 0
    ) {
      balance = BigInt(rawBalance);
    } else if (
      typeof rawBalance === "string" &&
      /^(?:0|[1-9]\d*)$/.test(rawBalance)
    ) {
      balance = BigInt(rawBalance);
    } else {
      throw new Error("Demos RPC returned an invalid address balance");
    }
    return { ...info, balance } as AddressInfo;
  }

  /** Read a safe, non-negative account nonce or fail closed. */
  async getAddressNonce(address: string): Promise<number> {
    const value = await this.nodeCall("getAddressNonce", { address });
    if (Number.isSafeInteger(value) && (value as number) >= 0) {
      return value as number;
    }
    if (typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value)) {
      const parsed = Number(value);
      if (Number.isSafeInteger(parsed)) return parsed;
    }
    throw new Error("Demos RPC returned no valid address nonce");
  }

  /** Poll until an account nonce reaches `target`, or throw on timeout. */
  async waitForNonce(
    address: string,
    target: number,
    options?: { timeoutMs?: number; pollIntervalMs?: number },
  ): Promise<number> {
    const deadline = Date.now() + (options?.timeoutMs ?? 60_000);
    while (Date.now() < deadline) {
      const observed = await this.getAddressNonce(address);
      if (observed >= target) return observed;
      await new Promise((resolve) =>
        setTimeout(resolve, options?.pollIntervalMs ?? 500)
      );
    }
    throw new Error(`Timed out waiting for nonce ${target}`);
  }

  /**
   * Read and cache the denomination-fork state for the connected RPC.
   * Returns `null` on an unavailable or invalid response; signing rejects it.
   */
  async getNetworkInfo(): Promise<NetworkInfo | null> {
    const rpc = this.requireRpc();
    if (this.networkInfo && this.networkInfoRpc === rpc) return this.networkInfo;
    if (
      this.networkInfoRpc === rpc &&
      this.networkFailureAt > 0 &&
      Date.now() - this.networkFailureAt < FAILURE_CACHE_MS
    ) return null;
    const observed = await this.nodeCall("getNetworkInfo");
    if (
      observed && typeof observed === "object" &&
      typeof (observed as NetworkInfo).forks?.osDenomination?.activated === "boolean"
    ) {
      this.networkInfo = observed as NetworkInfo;
      this.networkInfoRpc = rpc;
      this.networkFailureAt = 0;
      return this.networkInfo;
    }
    this.networkInfoRpc = rpc;
    this.networkFailureAt = Date.now();
    return null;
  }

  private async networkParameters(): Promise<Record<string, unknown> | null> {
    const observed = await this.nodeCall("getNetworkParameters");
    return observed && typeof observed === "object"
      ? observed as Record<string, unknown>
      : null;
  }

  private applyFallbackFee(transaction: Transaction): void {
    const sender = (transaction.content.from_ed25519_address ?? "").toLowerCase();
    let removed = 0n;
    for (const edit of transaction.content.gcr_edits ?? []) {
      if (
        edit.type === "balance" && edit.operation === "remove" &&
        edit.account?.toLowerCase() === sender && edit.amount !== undefined
      ) removed += parseOs(edit.amount);
    }
    const amount = parseOs(transaction.content.amount ?? 0);
    const fee = removed > amount ? removed - amount : 0n;
    transaction.content.transaction_fee = {
      network_fee: Number(fee / OS_PER_DEM),
      rpc_fee: 0,
      additional_fee: 0,
      rpc_address: null,
    };
  }

  /**
   * Sign a prepared transaction using the exact observed denomination mode.
   * Refuses to sign when the fork state, wallet, fee inputs or target is invalid.
   */
  async sign(transaction: Transaction): Promise<Transaction> {
    if (!this.walletConnected) throw new Error("Wallet not connected");
    const activated = (await this.getNetworkInfo())?.forks?.osDenomination
      ?.activated;
    if (typeof activated !== "boolean") {
      throw new TypeError(
        "Demos denomination-fork state is unavailable; refusing to sign",
      );
    }
    if (!transaction.content.timestamp) transaction.content.timestamp = Date.now();
    transaction.content.from = this.getAddress();
    transaction.content.from_ed25519_address ??= this.getAddress();
    const isStorage = transaction.content.type === "storageProgram";
    if (isStorage) {
      if (!/^stor-[0-9a-f]{40}$/i.test(transaction.content.to)) {
        throw new Error(`Invalid storage address format: ${transaction.content.to}`);
      }
    } else {
      transaction.content.to = ensure0x(transaction.content.to);
      if (!/^0x[0-9a-f]{64}$/i.test(transaction.content.to)) {
        throw new Error(`Invalid To address: ${transaction.content.to}`);
      }
    }
    transaction.content.gcr_edits = createGcrEdits(transaction);
    const parameters = await this.networkParameters();
    if (
      typeof parameters?.networkFee === "number" &&
      typeof parameters.rpcFee === "number"
    ) {
      transaction.content.transaction_fee = {
        network_fee: parameters.networkFee,
        rpc_fee: parameters.rpcFee,
        additional_fee: 0,
        rpc_address: null,
      };
    } else {
      this.applyFallbackFee(transaction);
    }
    const serialized = serializeTransactionContent(
      transaction.content,
      activated,
    );
    transaction.hash = sha256Hex(serialized);
    transaction.content = JSON.parse(serialized) as TransactionContent;
    const signature = await this.crypto.sign(
      "ed25519",
      new TextEncoder().encode(transaction.hash),
    );
    transaction.signature = { type: "ed25519", data: with0x(signature.signature) };
    return transaction;
  }

  /**
   * Prepare and sign a native transfer.
   *
   * `amountOs` is always expressed in OS, where 1 DEM = 1,000,000,000 OS.
   * This method does not confirm or broadcast the returned transaction.
   */
  async transfer(to: string, amountOs: bigint): Promise<Transaction> {
    if (amountOs < 0n) throw new Error("amount must be non-negative");
    const postFork = Boolean(
      (await this.getNetworkInfo())?.forks?.osDenomination?.activated,
    );
    if (!postFork && amountOs % OS_PER_DEM !== 0n) {
      throw new Error("sub-DEM precision is unsupported by the target node");
    }
    const transaction = emptyTransaction();
    transaction.content.to = to;
    transaction.content.nonce =
      (await this.getAddressNonce(this.getAddress())) + 1;
    transaction.content.amount = amountOs;
    transaction.content.type = "native";
    transaction.content.timestamp = Date.now();
    transaction.content.data = [
      "native",
      {
        nativeOperation: "send",
        args: [to, postFork ? amountOs.toString() : Number(amountOs / OS_PER_DEM)],
      },
    ];
    return await this.sign(transaction);
  }

  /** Ask the connected RPC to validate a signed transaction. */
  async confirm(transaction: Transaction): Promise<ValidityResponse> {
    const response = await this.call(
      "execute",
      "",
      transaction,
      "confirmTx",
    ) as ValidityResponse;
    if (!response.response?.data?.valid) {
      throw new Error(
        `[Confirm] Transaction is not valid: ${response.response?.data?.message ?? "unknown"}`,
      );
    }
    return response;
  }

  /** Broadcast a transaction only after a valid confirmation response. */
  async broadcast(validity: ValidityResponse): Promise<RpcResponse> {
    if (!validity.response?.data?.valid) {
      throw new Error(
        `[Broadcast] Transaction is not valid: ${validity.response?.data?.message ?? "unknown"}`,
      );
    }
    const response = await this.call(
      "execute",
      "",
      validity,
      "broadcastTx",
    ) as RpcResponse;
    if (typeof response.response === "string") {
      try {
        return { ...response, response: JSON.parse(response.response) };
      } catch {
        return response;
      }
    }
    return response;
  }
}
