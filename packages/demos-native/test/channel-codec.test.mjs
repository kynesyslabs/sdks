import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalChannelMessageSigningBytes,
  canonicalizeClaimReference,
  canonicalizeDacsJson,
  createCanonicalChannelMessage,
  importLegacyDemosChannelMessage,
  verifyCanonicalChannelMessage,
} from "../dist/channel-codec.js";

const FIXTURE_ROOT = new URL("./fixtures/", import.meta.url);
const CURRENT_FILE_SHA256 =
  "0b79fdd410548fe818541351ed4cff18284de361711e774a064c47847acfb46b";
const LEGACY_FILE_SHA256 =
  "ce43b226e358e15cb126b4b7d53b8638648c14ca55250eb57e6db68e451ba13f";
const FIRST_PAYLOAD_HEX =
  "646163732d63616e6f6e6963616c2d6368616e6e656c2d6d6573736167653a76313a" +
  "3261623165373836356565346435353863363133313330616265303539306465373232" +
  "3238323432366532663738373433653765343663353966356430303834";

async function fixture(name) {
  const bytes = await readFile(new URL(name, FIXTURE_ROOT));
  return { bytes, document: JSON.parse(bytes.toString("utf8")) };
}

function fixtureResolver(document) {
  const fixtures = new Map(
    document.authenticatedKeyFixtures.map((entry) => [entry.claim, entry]),
  );
  return (claim) => {
    if (claim.startsWith("cci:")) {
      return { algorithm: "ed25519", publicKey: claim.slice(4) };
    }
    const entry = fixtures.get(claim);
    return entry
      ? { algorithm: entry.algorithm, publicKey: entry.publicKey }
      : null;
  };
}

test("replays all 42 proposed current/dispatch vectors", async () => {
  const { bytes, document } = await fixture("canonical-channel-message-v0.6.json");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), CURRENT_FILE_SHA256);
  assert.equal(document.count, 42);
  assert.equal(document.vectors.length, 42);
  assert.equal(
    createHash("sha256").update(canonicalizeDacsJson(document.vectors)).digest("hex"),
    document.hash,
  );
  const resolver = fixtureResolver(document);
  for (const vector of document.vectors) {
    const verdict = vector.operation === "current-read"
      ? await verifyCanonicalChannelMessage(vector.message, vector.ctx, resolver)
      : await importLegacyDemosChannelMessage(vector.message, vector.ctx, resolver);
    assert.equal(verdict.outcome, vector.expected, `${vector.name}: ${verdict.code}`);
  }
  assert.equal(
    Buffer.from(canonicalChannelMessageSigningBytes(document.vectors[0].message))
      .toString("hex"),
    FIRST_PAYLOAD_HEX,
  );
  assert.equal(
    document.vectors[0].message.signature.value,
    "k8lLxC_h9H-EQndZ-Ws0Xuc9ubzyDe1rqBWA_bgyC72ex24X1zYixzg9q57BIFOeX5rbFWtoAsfDo2A9EOMaDQ",
  );
});

test("replays all 15 frozen v4.0.16 messages only through legacy import", async () => {
  const current = (await fixture("canonical-channel-message-v0.6.json")).document;
  const { bytes, document } = await fixture("channel-message-replay-v0.1.json");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), LEGACY_FILE_SHA256);
  assert.equal(document.count, 15);
  assert.equal(document.vectors.length, 15);
  const resolver = fixtureResolver(current);
  for (const vector of document.vectors) {
    const verdict = await importLegacyDemosChannelMessage(
      vector.message,
      vector.ctx,
      resolver,
    );
    assert.equal(verdict.outcome, vector.expected, `${vector.name}: ${verdict.code}`);
  }
  const validLegacy = document.vectors[0];
  assert.equal(
    (await verifyCanonicalChannelMessage(
      validLegacy.message,
      validLegacy.ctx,
      resolver,
    )).outcome,
    "error",
  );
});

test("producer emits only the current wire and preserves future signed members", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  const sender = `cci:${publicDer.subarray(-32).toString("hex")}`;
  const message = await createCanonicalChannelMessage({
    channelId: "channel-producer",
    sequence: 1,
    sender,
    sentAt: 1_900_000_000_000,
    type: "offer",
    body: { price: "10", currency: "DEM" },
    futureMinorField: { normalized: "e\u0301" },
  }, {
    signer: sender,
    algorithm: "ed25519",
    sign: (payload) => sign(null, payload, privateKey),
  });
  assert.equal(message.canonicalChannelMessageVersion, "1");
  assert.deepEqual(message.futureMinorField, { normalized: "é" });
  assert.doesNotMatch(message.signature.value, /=|\+|\//);
  const verdict = await verifyCanonicalChannelMessage(message, {
    sessionChannelId: "channel-producer",
    lastSequence: 0,
    priorChannelIds: [],
  }, () => ({ algorithm: "ed25519", publicKey: publicDer.subarray(-32) }));
  assert.deepEqual(verdict, { outcome: "pass", code: "verified" });

  const stripped = structuredClone(message);
  delete stripped.futureMinorField;
  assert.equal((await verifyCanonicalChannelMessage(stripped, {
    sessionChannelId: "channel-producer",
    lastSequence: 0,
    priorChannelIds: [],
  }, () => ({ algorithm: "ed25519", publicKey: publicDer.subarray(-32) }))).outcome, "fail");
});

test("ClaimReference production is deterministic and signed inputs require CF-2", async () => {
  assert.equal(
    canonicalizeClaimReference("DID:example:e\u0301?z=x%3ay&a=b"),
    "did:example:é?a=b&z=x%3Ay",
  );
  await assert.rejects(
    createCanonicalChannelMessage({
      channelId: "channel-producer",
      sequence: 1,
      sender: "DID:example:noncanonical",
      sentAt: 1,
      type: "offer",
      body: {},
    }, {
      signer: "did:example:noncanonical",
      algorithm: "ed25519",
      sign: () => new Uint8Array(64),
    }),
    /Malformed canonical channel-message input/,
  );
});
