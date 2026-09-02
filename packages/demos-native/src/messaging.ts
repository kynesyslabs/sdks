import { randomBytes } from "node:crypto";

import WebSocket, { type RawData } from "ws";

export interface SerializedEncryptedMessage {
  ciphertext: string;
  nonce: string;
  ephemeralKey?: string;
}

export type L2PSMessageStatus =
  | "delivered"
  | "queued"
  | "sent"
  | "failed"
  | "l2ps_pending"
  | "l2ps_batched"
  | "l2ps_confirmed";

export interface L2PSStoredMessage {
  id: string;
  from: string;
  to: string;
  messageHash: string;
  encrypted: SerializedEncryptedMessage;
  l2psUid: string;
  l2psTxHash: string | null;
  timestamp: number;
  status: L2PSMessageStatus;
}

export interface L2PSHistoryPage {
  messages: L2PSStoredMessage[];
  hasMore: boolean;
}

export interface L2PSIncomingMessage {
  from: string;
  encrypted: SerializedEncryptedMessage;
  messageHash: string;
  offline?: boolean;
}

export type L2PSSendResult =
  | { messageHash: string; l2psStatus: "submitted" | "failed" }
  | { messageHash: string; status: "queued" };

export type L2PSErrorCode =
  | "INVALID_MESSAGE"
  | "REGISTRATION_REQUIRED"
  | "INVALID_PROOF"
  | "PEER_NOT_FOUND"
  | "L2PS_NOT_FOUND"
  | "L2PS_SUBMIT_FAILED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface L2PSError {
  code: L2PSErrorCode;
  message: string;
  details?: string;
}

export type L2PSConnectionState =
  | "connected"
  | "disconnected"
  | "reconnecting";

export type L2PSMessageHandler = (message: L2PSIncomingMessage) => void;
export type L2PSErrorHandler = (error: L2PSError) => void;
export type L2PSConnectionStateHandler = (state: L2PSConnectionState) => void;

export interface L2PSMessagingConfig {
  serverUrl: string;
  publicKey: string;
  l2psUid: string;
  signFn(message: string): Promise<string> | string;
  requestTimeoutMs?: number;
  connectTimeoutMs?: number;
  maxReconnectAttempts?: number;
  baseReconnectDelayMs?: number;
}

interface RegisteredPayload {
  success: boolean;
  publicKey: string;
  l2psUid: string;
  onlinePeers: string[];
}

type ClientMessageType =
  | "register"
  | "send"
  | "history"
  | "discover"
  | "request_public_key";

type ServerMessageType =
  | "registered"
  | "message"
  | "message_sent"
  | "message_queued"
  | "history_response"
  | "discover_response"
  | "public_key_response"
  | "peer_joined"
  | "peer_left"
  | "error";

interface OutgoingFrame {
  type: ClientMessageType;
  payload: Record<string, unknown>;
  timestamp: number;
  requestId: string;
}

interface IncomingFrame {
  type: ServerMessageType;
  payload: Record<string, unknown>;
  timestamp: number;
  requestId?: string;
}

interface PendingResponse {
  expectedTypes: ReadonlySet<ServerMessageType>;
  resolve(value: Record<string, unknown>): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

const PUBLIC_KEY = /^[0-9a-f]{64}$/;
const HASH = /^[0-9a-f]{64}$/;
const SIGNATURE = /^[0-9a-f]{128}$/;
const BASE64 = /^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/;
const MAX_STRING = 4_096;
const MAX_L2PS_UID = 512;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_RECONNECT_ATTEMPTS = 10;
const DEFAULT_RECONNECT_DELAY_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_HISTORY_LIMIT = 1_000;
const MESSAGE_STATUSES = new Set<L2PSMessageStatus>([
  "delivered",
  "queued",
  "sent",
  "failed",
  "l2ps_pending",
  "l2ps_batched",
  "l2ps_confirmed",
]);

function integerOption(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const selected = value ?? fallback;
  if (
    !Number.isSafeInteger(selected) ||
    selected < minimum ||
    selected > maximum
  ) {
    throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return selected;
}

function canonicalString(value: string, label: string, maximum = MAX_STRING): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    value.normalize("NFC") !== value
  ) {
    throw new TypeError(`${label} must be a non-empty canonical string`);
  }
  return value;
}

function publicKey(value: string, label: string): string {
  if (!PUBLIC_KEY.test(value)) {
    throw new TypeError(`${label} must be a lowercase-hex Ed25519 public key`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rawDataToString(data: RawData): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return data.toString("utf8");
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "[::1]" ||
    /^127(?:\.[0-9]{1,3}){3}$/.test(hostname);
}

function canonicalBase64(
  value: unknown,
  label: string,
  length: { exact?: number; minimum?: number } = {},
): string {
  const encoded = canonicalString(value as string, label);
  if (!BASE64.test(encoded)) throw new TypeError(`${label} must be canonical base64`);
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.toString("base64") !== encoded ||
    (length.exact !== undefined && decoded.length !== length.exact) ||
    (length.minimum !== undefined && decoded.length < length.minimum)) {
    throw new TypeError(`${label} has an invalid canonical base64 length`);
  }
  return encoded;
}

function serverFrame(value: unknown): IncomingFrame | undefined {
  if (!isRecord(value) || typeof value.type !== "string" || !isRecord(value.payload)) {
    return undefined;
  }
  if (!Number.isSafeInteger(value.timestamp) || (value.timestamp as number) < 0) {
    return undefined;
  }
  if (value.requestId !== undefined && typeof value.requestId !== "string") {
    return undefined;
  }
  const supported = new Set<ServerMessageType>([
    "registered",
    "message",
    "message_sent",
    "message_queued",
    "history_response",
    "discover_response",
    "public_key_response",
    "peer_joined",
    "peer_left",
    "error",
  ]);
  if (!supported.has(value.type as ServerMessageType)) return undefined;
  return {
    type: value.type as ServerMessageType,
    payload: value.payload,
    timestamp: value.timestamp as number,
    ...(value.requestId === undefined ? {} : { requestId: value.requestId }),
  };
}

function encryptedMessage(value: unknown): SerializedEncryptedMessage | undefined {
  if (!isRecord(value)) return undefined;
  try {
    const ciphertext = canonicalBase64(value.ciphertext, "ciphertext", { minimum: 16 });
    const nonce = canonicalBase64(value.nonce, "nonce", { exact: 12 });
    const ephemeralKey = value.ephemeralKey === undefined
      ? undefined
      : publicKey(value.ephemeralKey as string, "ephemeralKey");
    return {
      ciphertext,
      nonce,
      ...(ephemeralKey === undefined ? {} : { ephemeralKey }),
    };
  } catch {
    return undefined;
  }
}

function incomingMessage(value: Record<string, unknown>): L2PSIncomingMessage | undefined {
  const encrypted = encryptedMessage(value.encrypted);
  if (typeof value.from !== "string" || !PUBLIC_KEY.test(value.from) ||
    typeof value.messageHash !== "string" || !HASH.test(value.messageHash) ||
    !encrypted || (value.offline !== undefined && typeof value.offline !== "boolean")) {
    return undefined;
  }
  return {
    from: value.from,
    encrypted,
    messageHash: value.messageHash,
    ...(value.offline === undefined ? {} : { offline: value.offline }),
  };
}

function storedMessage(value: unknown): L2PSStoredMessage | undefined {
  if (!isRecord(value) || typeof value.from !== "string" || !PUBLIC_KEY.test(value.from) ||
    typeof value.to !== "string" || !PUBLIC_KEY.test(value.to) ||
    typeof value.messageHash !== "string" || !HASH.test(value.messageHash) ||
    (value.l2psTxHash !== null &&
      (typeof value.l2psTxHash !== "string" || !HASH.test(value.l2psTxHash))) ||
    !Number.isSafeInteger(value.timestamp) || (value.timestamp as number) < 0 ||
    !MESSAGE_STATUSES.has(value.status as L2PSMessageStatus)) {
    return undefined;
  }
  const encrypted = encryptedMessage(value.encrypted);
  if (!encrypted) return undefined;
  try {
    return {
      id: canonicalString(value.id as string, "history message id"),
      from: value.from,
      to: value.to,
      messageHash: value.messageHash,
      encrypted,
      l2psUid: canonicalString(value.l2psUid as string, "history l2psUid", MAX_L2PS_UID),
      l2psTxHash: value.l2psTxHash as string | null,
      timestamp: value.timestamp as number,
      status: value.status as L2PSMessageStatus,
    };
  } catch {
    return undefined;
  }
}

/**
 * Dependency-minimal Node client for the existing Demos L2PS messaging server.
 * The server transports caller-owned ciphertext; this class does not define an
 * application signature or encryption profile and never receives a private key.
 */
export class L2PSMessagingPeer {
  readonly #serverUrl: string;
  readonly #publicKey: string;
  readonly #l2psUid: string;
  readonly #signFn: L2PSMessagingConfig["signFn"];
  readonly #requestTimeoutMs: number;
  readonly #connectTimeoutMs: number;
  readonly #maxReconnectAttempts: number;
  readonly #baseReconnectDelayMs: number;

  #socket: WebSocket | undefined;
  #connectPromise: Promise<RegisteredPayload> | undefined;
  #reconnectTimer: NodeJS.Timeout | undefined;
  #reconnectAttempts = 0;
  #shouldReconnect = false;
  #connected = false;
  #registered = false;
  #peers = new Set<string>();
  readonly #pending = new Map<string, PendingResponse>();
  readonly #messageHandlers = new Set<L2PSMessageHandler>();
  readonly #errorHandlers = new Set<L2PSErrorHandler>();
  readonly #connectionHandlers = new Set<L2PSConnectionStateHandler>();

  constructor(config: L2PSMessagingConfig) {
    const parsed = new URL(canonicalString(config.serverUrl, "serverUrl"));
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
      throw new TypeError("serverUrl must use ws: or wss:");
    }
    if (parsed.protocol === "ws:" && !isLoopbackHostname(parsed.hostname)) {
      throw new TypeError("remote L2PS servers must use authenticated wss:");
    }
    this.#serverUrl = parsed.href;
    this.#publicKey = publicKey(config.publicKey, "publicKey");
    this.#l2psUid = canonicalString(config.l2psUid, "l2psUid", MAX_L2PS_UID);
    if (typeof config.signFn !== "function") {
      throw new TypeError("signFn must be a function");
    }
    this.#signFn = config.signFn;
    this.#requestTimeoutMs = integerOption(
      config.requestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS,
      100,
      MAX_TIMEOUT_MS,
      "requestTimeoutMs",
    );
    this.#connectTimeoutMs = integerOption(
      config.connectTimeoutMs,
      DEFAULT_CONNECT_TIMEOUT_MS,
      100,
      MAX_TIMEOUT_MS,
      "connectTimeoutMs",
    );
    this.#maxReconnectAttempts = integerOption(
      config.maxReconnectAttempts,
      DEFAULT_RECONNECT_ATTEMPTS,
      0,
      100,
      "maxReconnectAttempts",
    );
    this.#baseReconnectDelayMs = integerOption(
      config.baseReconnectDelayMs,
      DEFAULT_RECONNECT_DELAY_MS,
      10,
      MAX_TIMEOUT_MS,
      "baseReconnectDelayMs",
    );
  }

  get isConnected(): boolean {
    return this.#connected;
  }

  get isRegistered(): boolean {
    return this.#registered;
  }

  get peers(): string[] {
    return [...this.#peers];
  }

  connect(): Promise<RegisteredPayload> {
    if (this.#connectPromise) return this.#connectPromise;
    this.#shouldReconnect = true;
    const promise = this.#openAndRegister(false).finally(() => {
      if (this.#connectPromise === promise) this.#connectPromise = undefined;
    });
    this.#connectPromise = promise;
    return promise;
  }

  disconnect(): void {
    this.#shouldReconnect = false;
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
    this.#rejectPending(new Error("L2PS messaging peer disconnected"));
    const socket = this.#socket;
    this.#socket = undefined;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    this.#setDisconnected();
  }

  async send(
    to: string,
    encrypted: SerializedEncryptedMessage,
    messageHash: string,
  ): Promise<L2PSSendResult> {
    this.#ensureRegistered();
    const recipient = publicKey(to, "recipient public key");
    if (!HASH.test(messageHash)) {
      throw new TypeError("messageHash must be 32-byte lowercase hex");
    }
    const validatedEncrypted = encryptedMessage(encrypted);
    if (!validatedEncrypted) {
      throw new TypeError("encrypted payload must use canonical AES-GCM wire encoding");
    }
    const result = await this.#request(
      "send",
      {
        to: recipient,
        encrypted: validatedEncrypted,
        messageHash,
      },
      ["message_sent", "message_queued"],
    );
    return result as unknown as L2PSSendResult;
  }

  async history(
    peerKey: string,
    options: { before?: number; limit?: number } = {},
  ): Promise<L2PSHistoryPage> {
    this.#ensureRegistered();
    const remote = publicKey(peerKey, "history peer key");
    if (
      options.before !== undefined &&
      (!Number.isSafeInteger(options.before) || options.before < 0)
    ) {
      throw new TypeError("history before must be a non-negative integer");
    }
    const limit = integerOption(
      options.limit,
      100,
      1,
      MAX_HISTORY_LIMIT,
      "history limit",
    );
    const timestamp = Date.now();
    const proof = await this.#signature(`history:${remote}:${timestamp}`);
    const result = await this.#request(
      "history",
      {
        peerKey: remote,
        ...(options.before === undefined ? {} : { before: options.before }),
        limit,
        proof,
      },
      ["history_response"],
      timestamp,
    );
    if (!Array.isArray(result.messages) || typeof result.hasMore !== "boolean") {
      throw new TypeError("Invalid history response from L2PS messaging server");
    }
    const messages = result.messages.map(storedMessage);
    if (messages.some((message) => message === undefined)) {
      throw new TypeError("Invalid history entry from L2PS messaging server");
    }
    return { messages: messages as L2PSStoredMessage[], hasMore: result.hasMore };
  }

  async discover(): Promise<string[]> {
    this.#ensureRegistered();
    const result = await this.#request("discover", {}, ["discover_response"]);
    if (!Array.isArray(result.peers) || !result.peers.every((item) => typeof item === "string")) {
      throw new Error("Invalid discovery response from L2PS messaging server");
    }
    this.#peers = new Set(result.peers as string[]);
    return [...this.#peers];
  }

  async requestPublicKey(targetId: string): Promise<string | null> {
    this.#ensureRegistered();
    const target = canonicalString(targetId, "targetId");
    const result = await this.#request(
      "request_public_key",
      { targetId: target },
      ["public_key_response"],
    );
    if (result.publicKey !== null && typeof result.publicKey !== "string") {
      throw new Error("Invalid public-key response from L2PS messaging server");
    }
    return result.publicKey as string | null;
  }

  onMessage(handler: L2PSMessageHandler): void {
    this.#messageHandlers.add(handler);
  }

  removeMessageHandler(handler: L2PSMessageHandler): void {
    this.#messageHandlers.delete(handler);
  }

  onError(handler: L2PSErrorHandler): void {
    this.#errorHandlers.add(handler);
  }

  removeErrorHandler(handler: L2PSErrorHandler): void {
    this.#errorHandlers.delete(handler);
  }

  onConnectionStateChange(handler: L2PSConnectionStateHandler): void {
    this.#connectionHandlers.add(handler);
  }

  removeConnectionStateHandler(handler: L2PSConnectionStateHandler): void {
    this.#connectionHandlers.delete(handler);
  }

  async #openAndRegister(reconnecting: boolean): Promise<RegisteredPayload> {
    if (this.#socket && this.#socket.readyState < WebSocket.CLOSING) {
      this.#socket.close();
    }
    this.#notifyConnection(reconnecting ? "reconnecting" : "disconnected");
    const socket = new WebSocket(this.#serverUrl);
    this.#socket = socket;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        socket.close();
        reject(new Error(`L2PS connection timed out after ${this.#connectTimeoutMs}ms`));
      }, this.#connectTimeoutMs);
      const cleanup = (): void => {
        clearTimeout(timer);
        socket.off("open", onOpen);
        socket.off("error", onInitialError);
        socket.off("close", onInitialClose);
      };
      const onOpen = (): void => {
        cleanup();
        this.#connected = true;
        this.#notifyConnection("connected");
        resolve();
      };
      const onInitialError = (error: Error): void => {
        cleanup();
        reject(error);
      };
      const onInitialClose = (): void => {
        cleanup();
        reject(new Error("L2PS connection closed before registration"));
      };
      socket.once("open", onOpen);
      socket.once("error", onInitialError);
      socket.once("close", onInitialClose);
    });

    socket.on("message", (data) => this.#handleRawMessage(data));
    socket.on("error", (error) => this.#emitError({
      code: "INTERNAL_ERROR",
      message: "L2PS WebSocket error",
      details: error.message,
    }));
    socket.on("close", () => this.#handleClose(socket));

    const timestamp = Date.now();
    const proof = await this.#signature(`register:${this.#publicKey}:${timestamp}`);
    const result = await this.#request(
      "register",
      {
        publicKey: this.#publicKey,
        l2psUid: this.#l2psUid,
        proof,
      },
      ["registered"],
      timestamp,
    );
    if (
      result.success !== true ||
      result.publicKey !== this.#publicKey ||
      result.l2psUid !== this.#l2psUid ||
      !Array.isArray(result.onlinePeers) ||
      !result.onlinePeers.every((item) => typeof item === "string")
    ) {
      throw new Error("Invalid registration response from L2PS messaging server");
    }
    this.#registered = true;
    this.#reconnectAttempts = 0;
    this.#peers = new Set(result.onlinePeers as string[]);
    return result as unknown as RegisteredPayload;
  }

  async #signature(message: string): Promise<string> {
    const value = await this.#signFn(message);
    if (typeof value !== "string" || !SIGNATURE.test(value)) {
      throw new Error("signFn must return a 64-byte lowercase-hex Ed25519 signature");
    }
    return value;
  }

  #request(
    type: ClientMessageType,
    payload: Record<string, unknown>,
    expectedTypes: readonly ServerMessageType[],
    timestamp = Date.now(),
  ): Promise<Record<string, unknown>> {
    const socket = this.#socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("L2PS messaging socket is not open"));
    }
    const requestId = `req_${timestamp}_${randomBytes(10).toString("hex")}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        reject(new Error(
          `Timeout waiting for ${expectedTypes.join("|")} after ${this.#requestTimeoutMs}ms`,
        ));
      }, this.#requestTimeoutMs);
      this.#pending.set(requestId, {
        expectedTypes: new Set(expectedTypes),
        resolve,
        reject,
        timer,
      });
      try {
        const frame: OutgoingFrame = { type, payload, timestamp, requestId };
        socket.send(JSON.stringify(frame));
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(requestId);
        reject(error instanceof Error ? error : new Error("L2PS send failed"));
      }
    });
  }

  #resolvePending(frame: IncomingFrame): boolean {
    const pending = frame.requestId ? this.#pending.get(frame.requestId) : undefined;
    if (!pending || !frame.requestId) return false;
    if (frame.type === "error") {
      clearTimeout(pending.timer);
      this.#pending.delete(frame.requestId);
      pending.reject(new Error(
        typeof frame.payload.message === "string"
          ? frame.payload.message
          : "L2PS server rejected the request",
      ));
      return true;
    }
    if (!pending.expectedTypes.has(frame.type)) return false;
    clearTimeout(pending.timer);
    this.#pending.delete(frame.requestId);
    pending.resolve(frame.payload);
    return true;
  }

  #handleNotification(frame: IncomingFrame): void {
    if (frame.type === "message") {
      const message = incomingMessage(frame.payload);
      if (!message) {
        this.#emitError({ code: "INVALID_MESSAGE", message: "Invalid L2PS message payload" });
        return;
      }
      this.#messageHandlers.forEach((handler) => {
        handler(message);
      });
      return;
    }
    if (frame.type === "peer_joined" && typeof frame.payload.publicKey === "string") {
      this.#peers.add(frame.payload.publicKey);
      return;
    }
    if (frame.type === "peer_left" && typeof frame.payload.publicKey === "string") {
      this.#peers.delete(frame.payload.publicKey);
      return;
    }
    if (frame.type === "error") {
      this.#emitError({
        code: typeof frame.payload.code === "string"
          ? frame.payload.code as L2PSErrorCode
          : "INTERNAL_ERROR",
        message: typeof frame.payload.message === "string"
          ? frame.payload.message
          : "L2PS server error",
        ...(typeof frame.payload.details === "string"
          ? { details: frame.payload.details }
          : {}),
      });
    }
  }

  #handleRawMessage(data: RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawDataToString(data));
    } catch {
      this.#emitError({ code: "INVALID_MESSAGE", message: "Invalid L2PS JSON frame" });
      return;
    }
    const frame = serverFrame(parsed);
    if (!frame) {
      this.#emitError({ code: "INVALID_MESSAGE", message: "Invalid L2PS protocol frame" });
      return;
    }
    if (!this.#resolvePending(frame)) this.#handleNotification(frame);
  }

  #handleClose(socket: WebSocket): void {
    if (this.#socket !== socket) return;
    this.#socket = undefined;
    this.#rejectPending(new Error("L2PS connection closed before a response"));
    this.#setDisconnected();
    if (!this.#shouldReconnect || this.#reconnectAttempts >= this.#maxReconnectAttempts) {
      return;
    }
    const delay = Math.min(
      this.#baseReconnectDelayMs * (2 ** this.#reconnectAttempts),
      30_000,
    );
    this.#reconnectAttempts += 1;
    this.#notifyConnection("reconnecting");
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      void this.#openAndRegister(true).catch((error: unknown) => {
        this.#emitError({
          code: "INTERNAL_ERROR",
          message: "L2PS reconnection failed",
          details: error instanceof Error ? error.message : "unknown error",
        });
        if (this.#shouldReconnect) this.#handleCloseAfterFailedReconnect();
      });
    }, delay);
  }

  #handleCloseAfterFailedReconnect(): void {
    this.#setDisconnected();
    if (this.#reconnectAttempts >= this.#maxReconnectAttempts) return;
    const delay = Math.min(
      this.#baseReconnectDelayMs * (2 ** this.#reconnectAttempts),
      30_000,
    );
    this.#reconnectAttempts += 1;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      void this.#openAndRegister(true).catch((error: unknown) => {
        this.#emitError({
          code: "INTERNAL_ERROR",
          message: "L2PS reconnection failed",
          details: error instanceof Error ? error.message : "unknown error",
        });
        if (this.#shouldReconnect) this.#handleCloseAfterFailedReconnect();
      });
    }, delay);
  }

  #ensureRegistered(): void {
    if (!this.#registered) {
      throw new Error("Not registered. Call connect() first.");
    }
  }

  #setDisconnected(): void {
    const changed = this.#connected || this.#registered || this.#peers.size > 0;
    this.#connected = false;
    this.#registered = false;
    this.#peers.clear();
    if (changed) this.#notifyConnection("disconnected");
  }

  #rejectPending(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  #emitError(error: L2PSError): void {
    this.#errorHandlers.forEach((handler) => handler(error));
  }

  #notifyConnection(state: L2PSConnectionState): void {
    this.#connectionHandlers.forEach((handler) => handler(state));
  }
}
