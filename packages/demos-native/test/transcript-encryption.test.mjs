import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalizeDacsJson } from "../dist/channel-codec.js";
import {
  computeEncryptedTranscriptContentHash,
  deriveTranscriptKemKeyPair,
  openEncryptedChannelTranscript,
  sealEncryptedChannelTranscript,
  verifyEncryptedTranscriptIntegrity,
} from "../dist/transcript-encryption.js";
import {
  serializeTranscriptEncryptionVector,
} from "../scripts/generate-transcript-encryption-vectors.mjs";

const VECTOR_URL = new URL("./fixtures/transcript-encryption-v0.1.json", import.meta.url);
const VECTOR_SHA256 =
  "e9c8c0a60da017c7d5f33e6c47c811ef77b30c4127258b3ecc78efc3ba5ec95d";
const vectorBytes = await readFile(VECTOR_URL);
const vector = JSON.parse(vectorBytes.toString("utf8"));
const fromHex = (value) => new Uint8Array(Buffer.from(value, "hex"));

function authority(status = "current", authenticatedAt = vector.authenticatedAt) {
  const identities = Object.values(vector.identities);
  return {
    authenticatedAt,
    resolveSigningKey: (claim) => {
      const identity = identities.find((candidate) => candidate.claim === claim);
      return identity
        ? { algorithm: "ed25519", publicKey: identity.publicKey }
        : null;
    },
    resolveKeyStatus: () => status,
  };
}

function kem(name) {
  return deriveTranscriptKemKeyPair(fromHex(vector.inputs.mlKemSeeds[name]));
}

function recipient(name, secretKey = kem(name).secretKey) {
  const identity = vector.identities[name];
  const binding = vector.envelope.recipientBindings.find(
    (candidate) => candidate.member === identity.claim,
  );
  assert.ok(binding);
  return { member: identity.claim, keyId: binding.keyId, secretKey };
}

function flipBase64Url(value) {
  const bytes = Buffer.from(value, "base64url");
  bytes[0] ^= 1;
  return bytes.toString("base64url");
}

function rehash(envelope) {
  envelope.contentHash = computeEncryptedTranscriptContentHash(envelope);
  return envelope;
}

function hashJson(value) {
  return createHash("sha256").update(canonicalizeDacsJson(value)).digest("hex");
}

test("golden suite vector regenerates byte-for-byte", async () => {
  assert.equal(createHash("sha256").update(vectorBytes).digest("hex"), VECTOR_SHA256);
  assert.equal(await serializeTranscriptEncryptionVector(), vectorBytes.toString("utf8"));
  assert.equal(vector.profile.suiteId, "dacs-transcript-mlkem768-a256gcm");
  assert.equal(vector.profile.suiteVersion, 1);
  assert.equal(vector.expected.contentHash, vector.envelope.contentHash);
  assert.equal(vector.expected.ciphertext, vector.envelope.ciphertext);
  assert.equal(vector.expected.tag, vector.envelope.tag);
});

test("both authorized roster members open the same authenticated transcript", async () => {
  assert.deepEqual(verifyEncryptedTranscriptIntegrity(vector.envelope), {
    outcome: "pass",
    step: 4,
    code: "public-integrity-verified",
    value: vector.envelope,
  });
  for (const name of ["memberA", "memberB"]) {
    const opened = await openEncryptedChannelTranscript(
      vector.envelope,
      recipient(name),
      authority(),
    );
    assert.equal(opened.outcome, "pass", `${name}: ${opened.code}`);
    assert.deepEqual(opened.value.transcript, vector.transcript);
    assert.equal(
      createHash("sha256").update(opened.value.plaintext).digest("hex"),
      vector.envelope.plaintextHash,
    );
  }
});

test("wrong recipient and wrong ML-KEM secret fail before content decryption", async () => {
  const outsider = kem("outsider");
  const absent = await openEncryptedChannelTranscript(vector.envelope, {
    member: `cci:${"ff".repeat(32)}`,
    keyId: "absent",
    secretKey: outsider.secretKey,
  }, authority());
  assert.deepEqual(absent, { outcome: "fail", step: 5, code: "recipient-wrap-not-found" });

  const wrongKey = await openEncryptedChannelTranscript(
    vector.envelope,
    recipient("memberA", outsider.secretKey),
    authority(),
  );
  assert.deepEqual(wrongKey, {
    outcome: "fail",
    step: 5,
    code: "recipient-wrap-authentication-failed",
  });
});

test("content and wrap tampering fail at the first applicable layer", async () => {
  const ciphertext = structuredClone(vector.envelope);
  ciphertext.ciphertext = flipBase64Url(ciphertext.ciphertext);
  assert.deepEqual(verifyEncryptedTranscriptIntegrity(ciphertext), {
    outcome: "fail",
    step: 4,
    code: "content-hash-mismatch",
  });
  const ciphertextRehashed = rehash(structuredClone(ciphertext));
  assert.equal((await openEncryptedChannelTranscript(
    ciphertextRehashed,
    recipient("memberA"),
    authority(),
  )).code, "content-authentication-or-json-failed");

  const wrap = structuredClone(vector.envelope);
  wrap.wraps[0].wrapped = flipBase64Url(wrap.wraps[0].wrapped);
  assert.equal(verifyEncryptedTranscriptIntegrity(wrap).code, "content-hash-mismatch");
  const wrapRehashed = rehash(structuredClone(wrap));
  const wrapOwner = wrapRehashed.recipientBindings[0].member === vector.identities.memberA.claim
    ? "memberA"
    : "memberB";
  assert.equal((await openEncryptedChannelTranscript(
    wrapRehashed,
    recipient(wrapOwner),
    authority(),
  )).code, "recipient-wrap-authentication-failed");
});

test("AAD edits fail publicly unless rehashed, then fail content authentication", async () => {
  const edited = structuredClone(vector.envelope);
  edited.channelId += "-edited";
  assert.equal(verifyEncryptedTranscriptIntegrity(edited).code, "content-hash-mismatch");
  const rehashed = rehash(structuredClone(edited));
  const opened = await openEncryptedChannelTranscript(
    rehashed,
    recipient("memberA"),
    authority(),
  );
  assert.deepEqual(opened, {
    outcome: "fail",
    step: 6,
    code: "content-authentication-or-json-failed",
  });
});

test("modified, revoked, unavailable and expired recipient bindings fail closed", async () => {
  const modified = structuredClone(vector.envelope);
  modified.recipientBindings[0].keySig.value = flipBase64Url(
    modified.recipientBindings[0].keySig.value,
  );
  modified.recipientBindingsHash = hashJson(modified.recipientBindings);
  rehash(modified);
  const signatureFailure = await openEncryptedChannelTranscript(
    modified,
    recipient("memberA"),
    authority(),
  );
  assert.equal(signatureFailure.outcome, "fail");
  assert.equal(signatureFailure.step, 2);
  assert.equal(signatureFailure.code, "recipient-key-signature-invalid");

  const revoked = await openEncryptedChannelTranscript(
    vector.envelope,
    recipient("memberA"),
    authority("revoked"),
  );
  assert.deepEqual(revoked, { outcome: "fail", step: 2, code: "recipient-key-revoked" });
  const unavailable = await openEncryptedChannelTranscript(
    vector.envelope,
    recipient("memberA"),
    authority("indeterminate"),
  );
  assert.deepEqual(unavailable, {
    outcome: "indeterminate",
    step: 2,
    code: "recipient-key-status-unavailable",
  });
  const expired = await openEncryptedChannelTranscript(
    vector.envelope,
    recipient("memberA"),
    authority("current", 2_000_000_000_000),
  );
  assert.deepEqual(expired, {
    outcome: "fail",
    step: 2,
    code: "recipient-key-outside-validity-window",
  });
});

test("unsupported suite and incomplete or duplicate recipient sets are malformed", async () => {
  const unsupported = structuredClone(vector.envelope);
  unsupported.suiteVersion = 2;
  assert.deepEqual(verifyEncryptedTranscriptIntegrity(unsupported), {
    outcome: "error",
    step: 1,
    code: "malformed-or-unsupported-envelope",
  });

  const missing = structuredClone(vector.envelope);
  missing.recipientBindings.pop();
  assert.equal(verifyEncryptedTranscriptIntegrity(missing).outcome, "error");

  const duplicate = structuredClone(vector.envelope);
  duplicate.recipientBindings[1] = structuredClone(duplicate.recipientBindings[0]);
  duplicate.wraps[1] = structuredClone(duplicate.wraps[0]);
  assert.deepEqual(verifyEncryptedTranscriptIntegrity(duplicate), {
    outcome: "error",
    step: 1,
    code: "recipient-bindings-not-canonical-bijection",
  });

  const wrongTranscriptVersion = structuredClone(vector.transcript);
  wrongTranscriptVersion.authenticatedTranscriptVersion = "2";
  await assert.rejects(
    sealEncryptedChannelTranscript({
      transcript: wrongTranscriptVersion,
      channelId: vector.envelope.channelId,
      recipientBindings: vector.envelope.recipientBindings,
      authority: authority(),
    }),
    /transcript version, channel or ordered member roster mismatch/,
  );
});
