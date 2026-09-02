import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { ml_kem768 } from "@noble/post-quantum/ml-kem";

import {
  canonicalizeClaimReference,
  canonicalizeDacsJson,
  createDacsJsonSignature,
  verifyDacsJsonSignature,
  type ChannelMessageSigner,
  type ChannelMessageSignature,
  type ChannelSigningKeyResolver,
} from "./channel-codec.js";

export const TRANSCRIPT_ENCRYPTION_SUITE_ID =
  "dacs-transcript-mlkem768-a256gcm";
export const TRANSCRIPT_ENCRYPTION_SUITE_VERSION = 1;
export const TRANSCRIPT_KEM_KEY_DOMAIN = "dacs-transcript-kem-key:v1:";

const ENVELOPE_VERSION = "1" as const;
const TRANSCRIPT_VERSION = "1" as const;
const KEM = "ml-kem-768" as const;
const HASH = /^[0-9a-f]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const ML_KEM_PUBLIC_KEY_BYTES = 1_184;
const ML_KEM_SECRET_KEY_BYTES = 2_400;
const ML_KEM_CIPHERTEXT_BYTES = 1_088;
const SHARED_SECRET_BYTES = 32;
const CEK_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const WRAPPED_CEK_BYTES = IV_BYTES + CEK_BYTES + TAG_BYTES;

export interface TranscriptKemKeyBindingUnsigned {
  keyBindingVersion: "1";
  member: string;
  keyId: string;
  kem: "ml-kem-768";
  publicKey: string;
  validFrom: number;
  expiresAt: number;
}

export interface TranscriptKemKeyBinding
  extends TranscriptKemKeyBindingUnsigned {
  keySig: ChannelMessageSignature;
}

export interface TranscriptRecipientWrap {
  member: string;
  keyId: string;
  kemCiphertext: string;
  /** Base64URL of 12-byte IV || 32-byte CEK ciphertext || 16-byte tag. */
  wrapped: string;
}

export interface EncryptedTranscriptHeader {
  suiteId: typeof TRANSCRIPT_ENCRYPTION_SUITE_ID;
  suiteVersion: typeof TRANSCRIPT_ENCRYPTION_SUITE_VERSION;
  transcriptVersion: "1";
  channelId: string;
  memberSetHash: string;
  recipientBindingsHash: string;
  plaintextHash: string;
}

export interface EncryptedChannelTranscript {
  envelopeVersion: "1";
  suiteId: typeof TRANSCRIPT_ENCRYPTION_SUITE_ID;
  suiteVersion: typeof TRANSCRIPT_ENCRYPTION_SUITE_VERSION;
  channelId: string;
  memberSetHash: string;
  recipientBindingsHash: string;
  plaintextHash: string;
  recipientBindings: TranscriptKemKeyBinding[];
  wraps: TranscriptRecipientWrap[];
  iv: string;
  ciphertext: string;
  tag: string;
  contentHash: string;
}

export interface TranscriptKemKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export type TranscriptKeyStatus = "current" | "revoked" | "indeterminate";

export interface TranscriptEncryptionAuthority {
  /** Authenticated substrate time used for admission/revocation decisions. */
  authenticatedAt: number;
  resolveSigningKey: ChannelSigningKeyResolver;
  resolveKeyStatus(
    binding: TranscriptKemKeyBinding,
    authenticatedAt: number,
  ): TranscriptKeyStatus | Promise<TranscriptKeyStatus>;
}

export interface TranscriptSealRandomness {
  cek: Uint8Array;
  iv: Uint8Array;
  wraps: Array<{
    member: string;
    keyId: string;
    encapsulation: Uint8Array;
    iv: Uint8Array;
  }>;
}

export type TranscriptEncryptionOutcome =
  | "pass"
  | "fail"
  | "indeterminate"
  | "error";

export interface TranscriptEncryptionResult<T = undefined> {
  outcome: TranscriptEncryptionOutcome;
  step: number;
  code: string;
  value?: T;
}

export interface OpenedTranscript {
  transcript: Record<string, unknown>;
  plaintext: Uint8Array;
}

function outcome<T>(
  result: TranscriptEncryptionOutcome,
  step: number,
  code: string,
  value?: T,
): TranscriptEncryptionResult<T> {
  return {
    outcome: result,
    step,
    code,
    ...(value === undefined ? {} : { value }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record);
  return actual.length === expected.length &&
    expected.every((key) => Object.hasOwn(record, key));
}

function canonicalString(value: unknown, label: string, maximum = 512): string {
  if (typeof value !== "string" || !value || value.length > maximum ||
    value.normalize("NFC") !== value || value.trim() !== value) {
    throw new TypeError(`${label} must be a non-empty canonical string`);
  }
  return value;
}

function canonicalClaim(value: unknown): string {
  const claim = canonicalString(value, "member ClaimReference", 4_096);
  if (canonicalizeClaimReference(claim) !== claim) {
    throw new TypeError("member ClaimReference is not in CF-2 form");
  }
  return claim;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
  return value as number;
}

function decodeBase64Url(
  value: unknown,
  expectedLength?: number,
): Buffer {
  if (typeof value !== "string" || !value || !BASE64URL.test(value) || value.length % 4 === 1) {
    throw new TypeError("binary field is not canonical unpadded Base64URL");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value ||
    (expectedLength !== undefined && decoded.length !== expectedLength)) {
    throw new TypeError("binary field is not canonical unpadded Base64URL");
  }
  return decoded;
}

function sha256Hex(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function jcsBytes(value: unknown): Buffer {
  return Buffer.from(canonicalizeDacsJson(value), "utf8");
}

function jcsHash(value: unknown): string {
  return sha256Hex(jcsBytes(value));
}

function compareMembers(
  left: { member: string },
  right: { member: string },
): number {
  return Buffer.compare(Buffer.from(left.member, "utf8"), Buffer.from(right.member, "utf8"));
}

function unsignedBinding(
  binding: TranscriptKemKeyBinding,
): TranscriptKemKeyBindingUnsigned {
  const { keySig: _keySig, ...unsigned } = binding;
  return unsigned;
}

function validateUnsignedBinding(
  value: unknown,
): TranscriptKemKeyBindingUnsigned {
  if (!isRecord(value) || !exactKeys(value, [
    "keyBindingVersion",
    "member",
    "keyId",
    "kem",
    "publicKey",
    "validFrom",
    "expiresAt",
  ]) || value.keyBindingVersion !== "1" || value.kem !== KEM) {
    throw new TypeError("invalid transcript KEM key binding");
  }
  const validFrom = nonNegativeInteger(value.validFrom, "validFrom");
  const expiresAt = nonNegativeInteger(value.expiresAt, "expiresAt");
  if (expiresAt <= validFrom) throw new TypeError("expiresAt must be after validFrom");
  decodeBase64Url(value.publicKey, ML_KEM_PUBLIC_KEY_BYTES);
  return {
    keyBindingVersion: "1",
    member: canonicalClaim(value.member),
    keyId: canonicalString(value.keyId, "keyId"),
    kem: KEM,
    publicKey: value.publicKey as string,
    validFrom,
    expiresAt,
  };
}

function validateBinding(value: unknown): TranscriptKemKeyBinding {
  if (!isRecord(value) || !exactKeys(value, [
    "keyBindingVersion",
    "member",
    "keyId",
    "kem",
    "publicKey",
    "validFrom",
    "expiresAt",
    "keySig",
  ])) throw new TypeError("invalid signed transcript KEM key binding");
  const unsigned = validateUnsignedBinding(Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "keySig"),
  ));
  if (!isRecord(value.keySig) || !exactKeys(value.keySig, [
    "signatureVersion",
    "signer",
    "algorithm",
    "value",
  ])) throw new TypeError("KEM key binding signature is malformed");
  return {
    ...unsigned,
    keySig: {
      signatureVersion: value.keySig.signatureVersion as "1",
      signer: value.keySig.signer as string,
      algorithm: value.keySig.algorithm as ChannelMessageSignature["algorithm"],
      value: value.keySig.value as string,
    },
  };
}

/** Deterministic raw ML-KEM-768 key generation for fixtures and key provisioning. */
export function deriveTranscriptKemKeyPair(seed: Uint8Array): TranscriptKemKeyPair {
  if (!(seed instanceof Uint8Array) || seed.length !== 64) {
    throw new TypeError("ML-KEM-768 key-generation seed must be 64 bytes");
  }
  const generated = ml_kem768.keygen(seed);
  return {
    publicKey: generated.publicKey,
    secretKey: generated.secretKey,
  };
}

/** Generate a production ML-KEM-768 key pair from a fresh 64-byte CSPRNG seed. */
export function generateTranscriptKemKeyPair(): TranscriptKemKeyPair {
  return deriveTranscriptKemKeyPair(randomBytes(64));
}

/** Bind a versioned ML-KEM key to one member using the DACS signing authority. */
export async function createTranscriptKemKeyBinding(
  input: TranscriptKemKeyBindingUnsigned,
  signer: ChannelMessageSigner,
): Promise<TranscriptKemKeyBinding> {
  const unsigned = validateUnsignedBinding(input);
  if (signer.signer !== unsigned.member) {
    throw new TypeError("KEM key-binding signer must equal member");
  }
  return {
    ...unsigned,
    keySig: await createDacsJsonSignature(unsigned, TRANSCRIPT_KEM_KEY_DOMAIN, signer),
  };
}

async function verifyBinding(
  raw: unknown,
  authority: TranscriptEncryptionAuthority,
): Promise<TranscriptEncryptionResult<TranscriptKemKeyBinding>> {
  let binding: TranscriptKemKeyBinding;
  try {
    binding = validateBinding(raw);
  } catch {
    return outcome("error", 2, "malformed-recipient-key-binding");
  }
  if (!Number.isSafeInteger(authority.authenticatedAt) || authority.authenticatedAt < 0) {
    return outcome("error", 2, "authenticated-substrate-time-invalid");
  }
  const signature = await verifyDacsJsonSignature(
    unsignedBinding(binding),
    TRANSCRIPT_KEM_KEY_DOMAIN,
    binding.keySig,
    binding.member,
    authority.resolveSigningKey,
  );
  if (signature.outcome !== "pass") {
    return outcome(signature.outcome, 2, `recipient-key-${signature.code}`);
  }
  if (authority.authenticatedAt < binding.validFrom ||
    authority.authenticatedAt >= binding.expiresAt) {
    return outcome("fail", 2, "recipient-key-outside-validity-window");
  }
  let status: TranscriptKeyStatus;
  try {
    status = await authority.resolveKeyStatus(binding, authority.authenticatedAt);
  } catch {
    return outcome("indeterminate", 2, "recipient-key-status-unavailable");
  }
  if (status === "indeterminate") {
    return outcome("indeterminate", 2, "recipient-key-status-unavailable");
  }
  if (status === "revoked") {
    return outcome("fail", 2, "recipient-key-revoked");
  }
  if (status !== "current") return outcome("error", 2, "recipient-key-status-invalid");
  return outcome("pass", 2, "recipient-key-authorized", binding);
}

function headerOf(envelope: Pick<EncryptedChannelTranscript,
  | "suiteId"
  | "suiteVersion"
  | "channelId"
  | "memberSetHash"
  | "recipientBindingsHash"
  | "plaintextHash"
>): EncryptedTranscriptHeader {
  return {
    suiteId: envelope.suiteId,
    suiteVersion: envelope.suiteVersion,
    transcriptVersion: TRANSCRIPT_VERSION,
    channelId: envelope.channelId,
    memberSetHash: envelope.memberSetHash,
    recipientBindingsHash: envelope.recipientBindingsHash,
    plaintextHash: envelope.plaintextHash,
  };
}

function encryptGcm(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
  aad?: Uint8Array,
): { ciphertext: Buffer; tag: Buffer } {
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, tag: cipher.getAuthTag() };
}

function decryptGcm(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  tag: Uint8Array,
  aad?: Uint8Array,
): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Public byte commitment covering the header, every wrap, and content AEAD. */
export function computeEncryptedTranscriptContentHash(
  envelope: Pick<EncryptedChannelTranscript,
    | "suiteId"
    | "suiteVersion"
    | "channelId"
    | "memberSetHash"
    | "recipientBindingsHash"
    | "plaintextHash"
    | "wraps"
    | "iv"
    | "ciphertext"
    | "tag"
  >,
): string {
  return sha256Hex(Buffer.concat([
    jcsBytes(headerOf(envelope)),
    jcsBytes(envelope.wraps),
    decodeBase64Url(envelope.iv, IV_BYTES),
    decodeBase64Url(envelope.ciphertext),
    decodeBase64Url(envelope.tag, TAG_BYTES),
  ]));
}

function productionRandomness(
  bindings: TranscriptKemKeyBinding[],
): TranscriptSealRandomness {
  return {
    cek: randomBytes(CEK_BYTES),
    iv: randomBytes(IV_BYTES),
    wraps: bindings.map(({ member, keyId }) => ({
      member,
      keyId,
      encapsulation: randomBytes(32),
      iv: randomBytes(IV_BYTES),
    })),
  };
}

function bindingCoordinate(member: string, keyId: string): string {
  return canonicalizeDacsJson([member, keyId]);
}

function validateRandomness(
  randomness: TranscriptSealRandomness,
  bindings: TranscriptKemKeyBinding[],
): Map<string, { encapsulation: Uint8Array; iv: Uint8Array }> {
  if (!(randomness.cek instanceof Uint8Array) || randomness.cek.length !== CEK_BYTES ||
    !(randomness.iv instanceof Uint8Array) || randomness.iv.length !== IV_BYTES ||
    !Array.isArray(randomness.wraps) || randomness.wraps.length !== bindings.length) {
    throw new TypeError("invalid transcript encryption randomness");
  }
  const byKey = new Map<string, { encapsulation: Uint8Array; iv: Uint8Array }>();
  for (const wrap of randomness.wraps) {
    const member = canonicalClaim(wrap.member);
    const keyId = canonicalString(wrap.keyId, "randomness keyId");
    const coordinate = bindingCoordinate(member, keyId);
    if (byKey.has(coordinate) || !(wrap.encapsulation instanceof Uint8Array) ||
      wrap.encapsulation.length !== 32 || !(wrap.iv instanceof Uint8Array) ||
      wrap.iv.length !== IV_BYTES) {
      throw new TypeError("invalid or duplicate wrap randomness");
    }
    byKey.set(coordinate, { encapsulation: wrap.encapsulation, iv: wrap.iv });
  }
  for (const binding of bindings) {
    if (!byKey.has(bindingCoordinate(binding.member, binding.keyId))) {
      throw new TypeError("wrap randomness does not cover every recipient binding");
    }
  }
  return byKey;
}

function transcriptRoster(
  transcript: Record<string, unknown>,
  channelId: string,
  expectedMembers: string[],
): void {
  if (transcript.authenticatedTranscriptVersion !== TRANSCRIPT_VERSION ||
    transcript.channelId !== channelId || !Array.isArray(transcript.members) ||
    transcript.members.length !== expectedMembers.length ||
    transcript.members.some((member, index) => member !== expectedMembers[index])) {
    throw new TypeError("transcript version, channel or ordered member roster mismatch");
  }
}

/** Seal one authenticated transcript after all recipient keys pass admission. */
export async function sealEncryptedChannelTranscript(input: {
  transcript: Record<string, unknown>;
  channelId: string;
  recipientBindings: TranscriptKemKeyBinding[];
  authority: TranscriptEncryptionAuthority;
  deterministicRandomnessForTestingOnly?: TranscriptSealRandomness;
}): Promise<EncryptedChannelTranscript> {
  if (!isRecord(input.transcript)) throw new TypeError("transcript must be an object");
  const channelId = canonicalString(input.channelId, "channelId", 4_096);
  if (!Array.isArray(input.recipientBindings) || input.recipientBindings.length === 0) {
    throw new TypeError("recipient bindings must be non-empty");
  }
  const bindings: TranscriptKemKeyBinding[] = [];
  for (const raw of input.recipientBindings) {
    const verified = await verifyBinding(raw, input.authority);
    if (verified.outcome !== "pass" || !verified.value) {
      throw new Error(`recipient binding admission ${verified.outcome}: ${verified.code}`);
    }
    bindings.push(verified.value);
  }
  bindings.sort(compareMembers);
  if (new Set(bindings.map(({ member }) => member)).size !== bindings.length) {
    throw new TypeError("recipient members must be duplicate-free");
  }
  const members = bindings.map(({ member }) => member);
  transcriptRoster(input.transcript, channelId, members);
  const plaintext = jcsBytes(input.transcript);
  const memberSetHash = jcsHash(members);
  const recipientBindingsHash = jcsHash(bindings);
  const plaintextHash = sha256Hex(plaintext);
  const header: EncryptedTranscriptHeader = {
    suiteId: TRANSCRIPT_ENCRYPTION_SUITE_ID,
    suiteVersion: TRANSCRIPT_ENCRYPTION_SUITE_VERSION,
    transcriptVersion: TRANSCRIPT_VERSION,
    channelId,
    memberSetHash,
    recipientBindingsHash,
    plaintextHash,
  };
  const randomness = input.deterministicRandomnessForTestingOnly ??
    productionRandomness(bindings);
  const wrapRandomness = validateRandomness(randomness, bindings);
  const content = encryptGcm(randomness.cek, randomness.iv, plaintext, jcsBytes(header));
  const wraps: TranscriptRecipientWrap[] = [];
  for (const binding of bindings) {
    const key = wrapRandomness.get(bindingCoordinate(binding.member, binding.keyId))!;
    const encapsulated = ml_kem768.encapsulate(
      decodeBase64Url(binding.publicKey, ML_KEM_PUBLIC_KEY_BYTES),
      key.encapsulation,
    );
    if (encapsulated.sharedSecret.length !== SHARED_SECRET_BYTES) {
      throw new Error("ML-KEM returned an invalid shared secret");
    }
    const wrapped = encryptGcm(encapsulated.sharedSecret, key.iv, randomness.cek);
    wraps.push({
      member: binding.member,
      keyId: binding.keyId,
      kemCiphertext: Buffer.from(encapsulated.cipherText).toString("base64url"),
      wrapped: Buffer.concat([key.iv, wrapped.ciphertext, wrapped.tag]).toString("base64url"),
    });
  }
  const envelope: EncryptedChannelTranscript = {
    envelopeVersion: ENVELOPE_VERSION,
    suiteId: TRANSCRIPT_ENCRYPTION_SUITE_ID,
    suiteVersion: TRANSCRIPT_ENCRYPTION_SUITE_VERSION,
    channelId,
    memberSetHash,
    recipientBindingsHash,
    plaintextHash,
    recipientBindings: bindings,
    wraps,
    iv: Buffer.from(randomness.iv).toString("base64url"),
    ciphertext: content.ciphertext.toString("base64url"),
    tag: content.tag.toString("base64url"),
    contentHash: "",
  };
  envelope.contentHash = computeEncryptedTranscriptContentHash(envelope);
  return envelope;
}

function parseEnvelope(value: unknown): EncryptedChannelTranscript {
  if (!isRecord(value) || !exactKeys(value, [
    "envelopeVersion",
    "suiteId",
    "suiteVersion",
    "channelId",
    "memberSetHash",
    "recipientBindingsHash",
    "plaintextHash",
    "recipientBindings",
    "wraps",
    "iv",
    "ciphertext",
    "tag",
    "contentHash",
  ]) || value.envelopeVersion !== ENVELOPE_VERSION ||
    value.suiteId !== TRANSCRIPT_ENCRYPTION_SUITE_ID ||
    value.suiteVersion !== TRANSCRIPT_ENCRYPTION_SUITE_VERSION) {
    throw new TypeError("unsupported transcript envelope or suite version");
  }
  const channelId = canonicalString(value.channelId, "channelId", 4_096);
  for (const field of [
    value.memberSetHash,
    value.recipientBindingsHash,
    value.plaintextHash,
    value.contentHash,
  ]) if (typeof field !== "string" || !HASH.test(field)) throw new TypeError("invalid hash field");
  if (!Array.isArray(value.recipientBindings) || value.recipientBindings.length === 0 ||
    !Array.isArray(value.wraps) || value.wraps.length !== value.recipientBindings.length) {
    throw new TypeError("recipient bindings and wraps must be matched non-empty arrays");
  }
  const bindings = value.recipientBindings.map(validateBinding);
  const wraps: TranscriptRecipientWrap[] = value.wraps.map((raw) => {
    if (!isRecord(raw) || !exactKeys(raw, ["member", "keyId", "kemCiphertext", "wrapped"])) {
      throw new TypeError("invalid recipient wrap");
    }
    const kemCiphertext = raw.kemCiphertext;
    const wrapped = raw.wrapped;
    decodeBase64Url(kemCiphertext, ML_KEM_CIPHERTEXT_BYTES);
    decodeBase64Url(wrapped, WRAPPED_CEK_BYTES);
    return {
      member: canonicalClaim(raw.member),
      keyId: canonicalString(raw.keyId, "wrap keyId"),
      kemCiphertext: kemCiphertext as string,
      wrapped: wrapped as string,
    };
  });
  decodeBase64Url(value.iv, IV_BYTES);
  decodeBase64Url(value.ciphertext);
  decodeBase64Url(value.tag, TAG_BYTES);
  return {
    envelopeVersion: ENVELOPE_VERSION,
    suiteId: TRANSCRIPT_ENCRYPTION_SUITE_ID,
    suiteVersion: TRANSCRIPT_ENCRYPTION_SUITE_VERSION,
    channelId,
    memberSetHash: value.memberSetHash as string,
    recipientBindingsHash: value.recipientBindingsHash as string,
    plaintextHash: value.plaintextHash as string,
    contentHash: value.contentHash as string,
    recipientBindings: bindings,
    wraps,
    iv: value.iv as string,
    ciphertext: value.ciphertext as string,
    tag: value.tag as string,
  };
}

function verifyEnvelopeStructure(
  value: unknown,
): TranscriptEncryptionResult<EncryptedChannelTranscript> {
  let envelope: EncryptedChannelTranscript;
  try {
    envelope = parseEnvelope(value);
  } catch {
    return outcome("error", 1, "malformed-or-unsupported-envelope");
  }
  const bindings = envelope.recipientBindings;
  if (new Set(bindings.map(({ member }) => member)).size !== bindings.length ||
    bindings.some((binding, index) => index > 0 &&
      compareMembers(bindings[index - 1]!, binding) >= 0)) {
    return outcome("error", 1, "recipient-bindings-not-canonical-bijection");
  }
  if (envelope.wraps.some((wrap, index) =>
    wrap.member !== bindings[index]!.member || wrap.keyId !== bindings[index]!.keyId)) {
    return outcome("error", 1, "recipient-wrap-bijection-mismatch");
  }
  return outcome("pass", 1, "structure-verified", envelope);
}

function verifyEnvelopeHashes(
  envelope: EncryptedChannelTranscript,
): TranscriptEncryptionResult<EncryptedChannelTranscript> {
  const bindings = envelope.recipientBindings;
  if (jcsHash(bindings.map(({ member }) => member)) !== envelope.memberSetHash) {
    return outcome("fail", 3, "member-set-hash-mismatch");
  }
  if (jcsHash(bindings) !== envelope.recipientBindingsHash) {
    return outcome("fail", 3, "recipient-bindings-hash-mismatch");
  }
  try {
    if (computeEncryptedTranscriptContentHash(envelope) !== envelope.contentHash) {
      return outcome("fail", 4, "content-hash-mismatch");
    }
  } catch {
    return outcome("error", 1, "malformed-content-encoding");
  }
  return outcome("pass", 4, "public-integrity-verified", envelope);
}

/** Verify public structure, canonical encodings, roster bindings and byte hash. */
export function verifyEncryptedTranscriptIntegrity(
  value: unknown,
): TranscriptEncryptionResult<EncryptedChannelTranscript> {
  const structure = verifyEnvelopeStructure(value);
  if (structure.outcome !== "pass" || !structure.value) return structure;
  return verifyEnvelopeHashes(structure.value);
}

/** Authorize every recipient key, then open for exactly one member/key ID. */
export async function openEncryptedChannelTranscript(
  value: unknown,
  recipient: { member: string; keyId: string; secretKey: Uint8Array },
  authority: TranscriptEncryptionAuthority,
): Promise<TranscriptEncryptionResult<OpenedTranscript>> {
  const structure = verifyEnvelopeStructure(value);
  if (structure.outcome !== "pass" || !structure.value) {
    return outcome(structure.outcome, structure.step, structure.code);
  }
  const envelope = structure.value;
  for (const binding of envelope.recipientBindings) {
    const authorized = await verifyBinding(binding, authority);
    if (authorized.outcome !== "pass") {
      return outcome(authorized.outcome, authorized.step, authorized.code);
    }
  }
  const integrity = verifyEnvelopeHashes(envelope);
  if (integrity.outcome !== "pass") {
    return outcome(integrity.outcome, integrity.step, integrity.code);
  }
  let member: string;
  let keyId: string;
  try {
    member = canonicalClaim(recipient.member);
    keyId = canonicalString(recipient.keyId, "recipient keyId");
  } catch {
    return outcome("error", 5, "malformed-recipient-coordinate");
  }
  if (!(recipient.secretKey instanceof Uint8Array) ||
    recipient.secretKey.length !== ML_KEM_SECRET_KEY_BYTES) {
    return outcome("error", 5, "malformed-recipient-secret-key");
  }
  const wrap = envelope.wraps.find((candidate) =>
    candidate.member === member && candidate.keyId === keyId);
  if (!wrap) return outcome("fail", 5, "recipient-wrap-not-found");

  let cek: Buffer;
  try {
    const sharedSecret = ml_kem768.decapsulate(
      decodeBase64Url(wrap.kemCiphertext, ML_KEM_CIPHERTEXT_BYTES),
      recipient.secretKey,
    );
    const framed = decodeBase64Url(wrap.wrapped, WRAPPED_CEK_BYTES);
    cek = decryptGcm(
      sharedSecret,
      framed.subarray(0, IV_BYTES),
      framed.subarray(IV_BYTES, -TAG_BYTES),
      framed.subarray(-TAG_BYTES),
    );
  } catch {
    return outcome("fail", 5, "recipient-wrap-authentication-failed");
  }

  let plaintext: Buffer;
  let transcript: unknown;
  try {
    plaintext = decryptGcm(
      cek,
      decodeBase64Url(envelope.iv, IV_BYTES),
      decodeBase64Url(envelope.ciphertext),
      decodeBase64Url(envelope.tag, TAG_BYTES),
      jcsBytes(headerOf(envelope)),
    );
    transcript = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
    if (!isRecord(transcript) || !plaintext.equals(jcsBytes(transcript))) {
      throw new Error("plaintext is not one canonical JSON object");
    }
  } catch {
    return outcome("fail", 6, "content-authentication-or-json-failed");
  }
  if (sha256Hex(plaintext) !== envelope.plaintextHash) {
    return outcome("fail", 7, "plaintext-hash-mismatch");
  }
  try {
    transcriptRoster(
      transcript,
      envelope.channelId,
      envelope.recipientBindings.map(({ member: rosterMember }) => rosterMember),
    );
  } catch {
    return outcome("fail", 8, "plaintext-channel-or-roster-mismatch");
  }
  return outcome("pass", 8, "opened", { transcript, plaintext });
}
