import {
  createHash,
  createPublicKey,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";

export const CURRENT_CHANNEL_MESSAGE_DOMAIN =
  "dacs-canonical-channel-message:v1:";
export const LEGACY_CHANNEL_MESSAGE_DOMAIN = "dacs-channelmsg:v1:";

export type ChannelMessageType =
  | "offer"
  | "counter"
  | "accept"
  | "reject"
  | "sealed-envelope-commit"
  | "sealed-envelope-reveal"
  | "abort";

export type ChannelSignatureAlgorithm =
  | "ed25519"
  | "ecdsa-secp256k1"
  | "sr1-aggregate";

export interface ChannelMessageSignature {
  signatureVersion: "1";
  signer: string;
  algorithm: ChannelSignatureAlgorithm;
  value: string;
}

export interface CanonicalChannelMessage {
  canonicalChannelMessageVersion: "1";
  channelId: string;
  sequence: number;
  sender: string;
  sentAt: number;
  type: ChannelMessageType;
  body: unknown;
  refs?: { repliesTo?: number };
  signature: ChannelMessageSignature;
  [member: string]: unknown;
}

export interface LegacyDemosChannelMessage {
  channelId: string;
  sequence: number;
  sender: string;
  sentAt: number;
  type: ChannelMessageType;
  body: unknown;
  refs?: { repliesTo?: number };
  signature: string;
  [member: string]: unknown;
}

export interface UnsignedCanonicalChannelMessage {
  channelId: string;
  sequence: number;
  sender: string;
  sentAt: number;
  type: ChannelMessageType;
  body: unknown;
  refs?: { repliesTo?: number };
  [member: string]: unknown;
}

export interface ChannelMessageContext {
  sessionChannelId: string;
  lastSequence: number;
  priorChannelIds: string[];
}

export interface AuthenticatedChannelSigningKey {
  algorithm: ChannelSignatureAlgorithm;
  /** Raw Ed25519/SR-1 root bytes or compressed SEC1 secp256k1 bytes. */
  publicKey: Uint8Array | string;
}

export type ChannelSigningKeyResolver = (
  canonicalSigner: string,
) =>
  | AuthenticatedChannelSigningKey
  | null
  | undefined
  | Promise<AuthenticatedChannelSigningKey | null | undefined>;

export interface ChannelMessageSigner {
  signer: string;
  algorithm: ChannelSignatureAlgorithm;
  sign(payload: Uint8Array): Uint8Array | Promise<Uint8Array>;
}

export type ChannelMessageOutcome =
  | "pass"
  | "fail"
  | "indeterminate"
  | "error";

export interface ChannelMessageVerificationResult {
  outcome: ChannelMessageOutcome;
  code: string;
}

const CLAIM_SCHEME = /^[a-z][a-z0-9-]*$/;
const LOWER_HEX_64 = /^[0-9a-f]{64}$/;
const LOWER_HEX_66 = /^[0-9a-f]{66}$/;
const LOWER_HEX_128 = /^[0-9a-f]{128}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MESSAGE_TYPES = new Set<ChannelMessageType>([
  "offer",
  "counter",
  "accept",
  "reject",
  "sealed-envelope-commit",
  "sealed-envelope-reveal",
  "abort",
]);
const ALGORITHMS = new Set<ChannelSignatureAlgorithm>([
  "ed25519",
  "ecdsa-secp256k1",
  "sr1-aggregate",
]);
const CURRENT_DOMAIN_BYTES = Buffer.from(CURRENT_CHANNEL_MESSAGE_DOMAIN, "utf8");
const LEGACY_DOMAIN_BYTES = Buffer.from(LEGACY_CHANNEL_MESSAGE_DOMAIN, "utf8");
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const SECP256K1_SPKI_PREFIX = Buffer.from(
  "3036301006072a8648ce3d020106052b8104000a032200",
  "hex",
);
const SECP256K1_ORDER = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141",
);

function result(
  outcome: ChannelMessageOutcome,
  code: string,
): ChannelMessageVerificationResult {
  return { outcome, code };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** RFC 8785 requires raw UTF-16 code-unit order, not locale collation. */
function compareUtf16CodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftUnit = left.charCodeAt(index); // NOSONAR -- mandated by RFC 8785
    const rightUnit = right.charCodeAt(index); // NOSONAR -- mandated by RFC 8785
    if (leftUnit !== rightUnit) return leftUnit - rightUnit;
  }
  return left.length - right.length;
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort(compareUtf16CodeUnits);
  const sortedExpected = [...expected].sort(compareUtf16CodeUnits);
  return actual.length === expected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
}

function validUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const point = value.codePointAt(index)!;
    if (point >= 0xd800 && point <= 0xdfff) return false;
    if (point > 0xffff) index += 1;
  }
  return true;
}

function normalizeJson(value: unknown, ancestors: Set<object>): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (!validUnicode(value)) throw new TypeError("JSON contains invalid Unicode");
    return value.normalize("NFC");
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("JSON numbers must be finite");
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`JSON contains unsupported ${typeof value}`);
  }
  if (!isRecord(value) && !Array.isArray(value)) {
    throw new TypeError("JSON values must use plain objects and arrays");
  }
  if (ancestors.has(value)) throw new TypeError("JSON contains a cycle");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((member) => normalizeJson(member, ancestors));
    }
    const normalized: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(value)) {
      if (!validUnicode(key)) throw new TypeError("JSON member name has invalid Unicode");
      normalized[key] = normalizeJson(value[key], ancestors);
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

function jcs(value: unknown): string {
  if (value === null || typeof value === "boolean" ||
    typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  const record = value as Record<string, unknown>;
  const members = Object.keys(record)
    .sort(compareUtf16CodeUnits)
    .map((key) => `${JSON.stringify(key)}:${jcs(record[key])}`);
  return `{${members.join(",")}}`;
}

/** RFC 8785 JCS after DACS CORE CF-1 values-only NFC normalization. */
export function canonicalizeDacsJson(value: unknown): string {
  return jcs(normalizeJson(value, new Set()));
}

function encodeParameterComponent(value: string): string {
  return value.replace(/[:?&=%]/g, (character) => ({
    ":": "%3A",
    "?": "%3F",
    "&": "%26",
    "=": "%3D",
    "%": "%25",
  })[character]!);
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (value) => value.codePointAt(0)!);
  const b = Array.from(right, (value) => value.codePointAt(0)!);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

/** Convert a ClaimReference to its CORE CF-2 canonical byte form. */
export function canonicalizeClaimReference(value: string): string {
  if (typeof value !== "string" || !validUnicode(value)) {
    throw new TypeError("ClaimReference must be valid Unicode");
  }
  const colon = value.indexOf(":");
  if (colon <= 0) throw new TypeError("ClaimReference requires scheme:identifier");
  const scheme = value.slice(0, colon).toLowerCase();
  if (!CLAIM_SCHEME.test(scheme)) throw new TypeError("Invalid ClaimReference scheme");

  const suffix = value.slice(colon + 1);
  const question = suffix.indexOf("?");
  const identifier = (question < 0 ? suffix : suffix.slice(0, question)).normalize("NFC");
  if (!identifier) throw new TypeError("ClaimReference identifier is empty");
  if (scheme === "cci" && !LOWER_HEX_64.test(identifier)) {
    throw new TypeError("cci ClaimReference requires a lowercase-hex Ed25519 key");
  }
  if (question < 0) return `${scheme}:${identifier}`;

  const encodedParameters = suffix.slice(question + 1);
  if (!encodedParameters) throw new TypeError("ClaimReference parameters are empty");
  const seen = new Set<string>();
  const parameters = encodedParameters.split("&").map((entry) => {
    const equals = entry.indexOf("=");
    if (equals <= 0) throw new TypeError("ClaimReference parameter requires key=value");
    let key: string;
    let parameterValue: string;
    try {
      key = decodeURIComponent(entry.slice(0, equals)).normalize("NFC");
      parameterValue = decodeURIComponent(entry.slice(equals + 1)).normalize("NFC");
    } catch {
      throw new TypeError("ClaimReference contains invalid percent encoding");
    }
    if (!key || seen.has(key)) {
      throw new TypeError("ClaimReference parameter keys must be unique and non-empty");
    }
    seen.add(key);
    return { key, value: parameterValue };
  });
  parameters.sort((left, right) => compareCodePoints(left.key, right.key));
  const canonicalParameters = parameters.map(({ key, value: parameterValue }) =>
    `${encodeParameterComponent(key)}=${encodeParameterComponent(parameterValue)}`
  ).join("&");
  return `${scheme}:${identifier}?${canonicalParameters}`;
}

function isCanonicalClaimReference(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return canonicalizeClaimReference(value) === value;
  } catch {
    return false;
  }
}

function validContext(value: unknown): value is ChannelMessageContext {
  if (!isRecord(value) || !hasExactKeys(value, [
    "sessionChannelId",
    "lastSequence",
    "priorChannelIds",
  ])) return false;
  return typeof value.sessionChannelId === "string" && value.sessionChannelId.length > 0 &&
    Number.isSafeInteger(value.lastSequence) && (value.lastSequence as number) >= 0 &&
    Array.isArray(value.priorChannelIds) &&
    value.priorChannelIds.every((item) => typeof item === "string" && item.length > 0);
}

function validCommonShape(
  message: Record<string, unknown>,
  requireSignature = true,
): boolean {
  const required = ["channelId", "sequence", "sender", "sentAt", "type", "body"];
  if (requireSignature) required.push("signature");
  if (!required.every((member) => Object.hasOwn(message, member))) return false;
  if (typeof message.channelId !== "string" || message.channelId.length === 0) return false;
  if (!Number.isSafeInteger(message.sequence) || (message.sequence as number) < 1) return false;
  if (!isCanonicalClaimReference(message.sender)) return false;
  if (!Number.isSafeInteger(message.sentAt) || (message.sentAt as number) < 0) return false;
  if (!MESSAGE_TYPES.has(message.type as ChannelMessageType)) return false;
  if (message.refs !== undefined) {
    if (!isRecord(message.refs) || !Object.keys(message.refs).every((key) => key === "repliesTo")) {
      return false;
    }
    if (message.refs.repliesTo !== undefined &&
      (!Number.isSafeInteger(message.refs.repliesTo) ||
        (message.refs.repliesTo as number) < 1)) return false;
  }
  try {
    canonicalizeDacsJson(Object.fromEntries(
      Object.entries(message).filter(([key]) => key !== "signature"),
    ));
  } catch {
    return false;
  }
  return true;
}

function unsignedMessage(message: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(message).filter(([key]) => key !== "signature"),
  );
}

function messageDigest(message: Record<string, unknown>): Buffer {
  return createHash("sha256")
    .update(Buffer.from(canonicalizeDacsJson(unsignedMessage(message)), "utf8"))
    .digest();
}

/** Reconstruct the exact CH-8 current-message signing payload. */
export function canonicalChannelMessageSigningBytes(message: unknown): Uint8Array {
  if (!isRecord(message)) throw new TypeError("Channel message must be an object");
  const digestHex = messageDigest(message).toString("hex");
  return Buffer.concat([CURRENT_DOMAIN_BYTES, Buffer.from(digestHex, "ascii")]);
}

function legacyChannelMessageSigningBytes(message: Record<string, unknown>): Uint8Array {
  return Buffer.concat([LEGACY_DOMAIN_BYTES, messageDigest(message)]);
}

function decodeBase64Url(value: unknown): Buffer {
  if (typeof value !== "string" || !value || !BASE64URL.test(value) || value.length % 4 === 1) {
    throw new TypeError("Signature value is not canonical unpadded Base64URL");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new TypeError("Signature value is not canonical unpadded Base64URL");
  }
  return decoded;
}

function keyBytes(value: Uint8Array | string, pattern: RegExp, label: string): Buffer {
  if (typeof value === "string") {
    if (!pattern.test(value)) throw new TypeError(`Invalid ${label}`);
    return Buffer.from(value, "hex");
  }
  if (!(value instanceof Uint8Array)) throw new TypeError(`Invalid ${label}`);
  return Buffer.from(value);
}

function ed25519PublicKey(value: Uint8Array | string): KeyObject {
  const bytes = keyBytes(value, LOWER_HEX_64, "Ed25519 public key");
  if (bytes.length !== 32) throw new TypeError("Invalid Ed25519 public key");
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, bytes]),
    format: "der",
    type: "spki",
  });
}

function secp256k1PublicKey(value: Uint8Array | string): KeyObject {
  const bytes = keyBytes(value, LOWER_HEX_66, "compressed secp256k1 public key");
  if (bytes.length !== 33 || (bytes[0] !== 2 && bytes[0] !== 3)) {
    throw new TypeError("Invalid compressed secp256k1 public key");
  }
  return createPublicKey({
    key: Buffer.concat([SECP256K1_SPKI_PREFIX, bytes]),
    format: "der",
    type: "spki",
  });
}

function derInteger(bytes: Buffer, offset: number): { value: bigint; next: number } {
  if (bytes[offset] !== 0x02) throw new TypeError("ECDSA signature is not canonical DER");
  const length = bytes[offset + 1];
  if (length === undefined || length === 0 || length >= 0x80) {
    throw new TypeError("ECDSA signature is not canonical DER");
  }
  const start = offset + 2;
  const end = start + length;
  if (end > bytes.length || (bytes[start]! & 0x80) !== 0 ||
    (length > 1 && bytes[start] === 0 && (bytes[start + 1]! & 0x80) === 0)) {
    throw new TypeError("ECDSA signature is not canonical DER");
  }
  return { value: BigInt(`0x${bytes.subarray(start, end).toString("hex")}`), next: end };
}

function validCanonicalLowSEcdsa(signature: Buffer): boolean {
  try {
    if (signature.length < 8 || signature[0] !== 0x30 ||
      signature[1] !== signature.length - 2 || signature[1]! >= 0x80) return false;
    const r = derInteger(signature, 2);
    const s = derInteger(signature, r.next);
    return s.next === signature.length && r.value >= 1n && r.value < SECP256K1_ORDER &&
      s.value >= 1n && s.value <= SECP256K1_ORDER / 2n;
  } catch {
    return false;
  }
}

function validSignatureEncoding(
  algorithm: ChannelSignatureAlgorithm,
  signature: Buffer,
): boolean {
  if (algorithm === "ecdsa-secp256k1") return validCanonicalLowSEcdsa(signature);
  return signature.length === 64;
}

function verifyWithKey(
  key: AuthenticatedChannelSigningKey,
  signature: Buffer,
  payload: Uint8Array,
): boolean {
  if (!validSignatureEncoding(key.algorithm, signature)) return false;
  if (key.algorithm === "ecdsa-secp256k1") {
    return verifySignature("sha256", payload, secp256k1PublicKey(key.publicKey), signature);
  }
  return verifySignature(null, payload, ed25519PublicKey(key.publicKey), signature);
}

async function resolveKey(
  signer: string,
  resolver: ChannelSigningKeyResolver,
): Promise<AuthenticatedChannelSigningKey | null> {
  try {
    return await resolver(signer) ?? null;
  } catch {
    return null;
  }
}

function applyChannelPolicy(
  message: Record<string, unknown>,
  context: ChannelMessageContext,
): ChannelMessageVerificationResult {
  if (message.channelId !== context.sessionChannelId) {
    return result("fail", "foreign-channel");
  }
  if (context.priorChannelIds.includes(message.channelId as string)) {
    return result("fail", "reused-channel-id");
  }
  if ((message.sequence as number) <= context.lastSequence) {
    return result("fail", "non-monotonic-sequence");
  }
  return result("pass", "verified");
}

/** Verify only the explicitly selected current-read arm; never falls back. */
export async function verifyCanonicalChannelMessage(
  message: unknown,
  context: ChannelMessageContext,
  resolver: ChannelSigningKeyResolver,
): Promise<ChannelMessageVerificationResult> {
  if (!validContext(context) || !isRecord(message)) return result("error", "malformed-context-or-message");
  if (!Object.hasOwn(message, "canonicalChannelMessageVersion")) {
    return result("error", "current-discriminator-missing");
  }
  if (message.canonicalChannelMessageVersion !== "1" || !validCommonShape(message)) {
    return result("error", "malformed-current-message");
  }
  const signature = message.signature;
  if (!isRecord(signature) || !hasExactKeys(signature, [
    "signatureVersion",
    "signer",
    "algorithm",
    "value",
  ]) || signature.signatureVersion !== "1" ||
    !ALGORITHMS.has(signature.algorithm as ChannelSignatureAlgorithm) ||
    !isCanonicalClaimReference(signature.signer)) {
    return result("error", "malformed-current-signature");
  }
  let signatureBytes: Buffer;
  try {
    signatureBytes = decodeBase64Url(signature.value);
  } catch {
    return result("error", "non-canonical-signature-value");
  }
  if (signature.signer !== message.sender) return result("fail", "signer-sender-mismatch");

  const key = await resolveKey(signature.signer, resolver);
  if (!key) return result("indeterminate", "signing-key-unavailable");
  if (!ALGORITHMS.has(key.algorithm) || key.algorithm !== signature.algorithm) {
    return result("fail", "signature-algorithm-key-mismatch");
  }
  try {
    if (!verifyWithKey(
      key,
      signatureBytes,
      canonicalChannelMessageSigningBytes(message),
    )) return result("fail", "signature-invalid");
  } catch {
    return result("error", "invalid-authenticated-key");
  }
  return applyChannelPolicy(message, context);
}

/** Verify only the explicitly selected frozen v4.0.16 legacy-import arm. */
export async function importLegacyDemosChannelMessage(
  message: unknown,
  context: ChannelMessageContext,
  resolver: ChannelSigningKeyResolver,
): Promise<ChannelMessageVerificationResult> {
  if (!validContext(context) || !isRecord(message)) return result("error", "malformed-context-or-message");
  if (Object.hasOwn(message, "canonicalChannelMessageVersion") ||
    !validCommonShape(message) ||
    typeof message.signature !== "string" ||
    !LOWER_HEX_128.test(message.signature)) {
    return result("error", "malformed-legacy-message");
  }
  const key = await resolveKey(message.sender as string, resolver);
  if (!key) return result("indeterminate", "signing-key-unavailable");
  if (key.algorithm !== "ed25519") {
    return result("fail", "legacy-key-algorithm-mismatch");
  }
  try {
    if (!verifyWithKey(
      key,
      Buffer.from(message.signature, "hex"),
      legacyChannelMessageSigningBytes(message),
    )) return result("fail", "signature-invalid");
  } catch {
    return result("error", "invalid-authenticated-key");
  }
  return applyChannelPolicy(message, context);
}

/** Create only the current version-1 wire; no legacy producer exists. */
export async function createCanonicalChannelMessage(
  input: UnsignedCanonicalChannelMessage,
  signer: ChannelMessageSigner,
): Promise<CanonicalChannelMessage> {
  if (!isRecord(input) || Object.hasOwn(input, "signature") ||
    Object.hasOwn(input, "canonicalChannelMessageVersion")) {
    throw new TypeError("Producer input must omit signature and version discriminator");
  }
  if (!isCanonicalClaimReference(signer.signer) ||
    !ALGORITHMS.has(signer.algorithm) || typeof signer.sign !== "function") {
    throw new TypeError("Invalid canonical channel-message signer");
  }
  const normalized = JSON.parse(
    canonicalizeDacsJson(input),
  ) as UnsignedCanonicalChannelMessage;
  if (!validCommonShape(normalized as Record<string, unknown>, false)) {
    throw new TypeError("Malformed canonical channel-message input");
  }
  if (normalized.sender !== signer.signer) {
    throw new TypeError("Channel-message signer must equal sender");
  }
  const unsigned = {
    canonicalChannelMessageVersion: "1" as const,
    ...normalized,
  };
  const signatureBytes = Buffer.from(await signer.sign(
    canonicalChannelMessageSigningBytes(unsigned),
  ));
  if (!validSignatureEncoding(signer.algorithm, signatureBytes)) {
    throw new TypeError("Signer returned an invalid algorithm-specific signature");
  }
  return {
    ...unsigned,
    signature: {
      signatureVersion: "1",
      signer: signer.signer,
      algorithm: signer.algorithm,
      value: signatureBytes.toString("base64url"),
    },
  } as CanonicalChannelMessage;
}
