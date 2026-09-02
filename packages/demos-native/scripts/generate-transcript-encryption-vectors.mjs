import {
  createPrivateKey,
  createPublicKey,
  sign,
} from "node:crypto";
import {
  readFileSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";

import {
  createTranscriptKemKeyBinding,
  deriveTranscriptKemKeyPair,
  sealEncryptedChannelTranscript,
} from "../dist/transcript-encryption.js";

const VECTOR_URL = new URL("../test/fixtures/transcript-encryption-v0.1.json", import.meta.url);
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const AUTHENTICATED_AT = 1_900_000_000_000;
const CHANNEL_ID = "channel-transcript-suite-vector";
const KEY_ID = "mlkem-primary-2026-01";

const INPUTS = {
  ed25519Seeds: {
    memberA: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    memberB: "202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f",
  },
  mlKemSeeds: {
    memberA: "404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f",
    memberB: "808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9fa0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebf",
    outsider: "c0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedfe0e1e2e3e4e5e6e7e8e9eaebecedeeeff0f1f2f3f4f5f6f7f8f9fafbfcfdfeff",
  },
  randomness: {
    cek: "101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f",
    iv: "303132333435363738393a3b",
    encapsulations: [
      "505152535455565758595a5b5c5d5e5f606162636465666768696a6b6c6d6e6f",
      "707172737475767778797a7b7c7d7e7f808182838485868788898a8b8c8d8e8f",
    ],
    wrapIvs: ["909192939495969798999a9b", "a0a1a2a3a4a5a6a7a8a9aaab"],
  },
};

const fromHex = (value) => new Uint8Array(Buffer.from(value, "hex"));

function ed25519(seedHex) {
  const privateKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(seedHex, "hex")]),
    format: "der",
    type: "pkcs8",
  });
  const publicDer = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  const publicKey = publicDer.subarray(-32);
  return {
    privateKey,
    publicKey,
    claim: `cci:${publicKey.toString("hex")}`,
  };
}

export async function generateTranscriptEncryptionVector() {
  const signing = {
    memberA: ed25519(INPUTS.ed25519Seeds.memberA),
    memberB: ed25519(INPUTS.ed25519Seeds.memberB),
  };
  const kem = {
    memberA: deriveTranscriptKemKeyPair(fromHex(INPUTS.mlKemSeeds.memberA)),
    memberB: deriveTranscriptKemKeyPair(fromHex(INPUTS.mlKemSeeds.memberB)),
    outsider: deriveTranscriptKemKeyPair(fromHex(INPUTS.mlKemSeeds.outsider)),
  };
  const entries = ["memberA", "memberB"].map((name) => ({
    name,
    signing: signing[name],
    kem: kem[name],
  })).sort((left, right) => Buffer.compare(
    Buffer.from(left.signing.claim, "utf8"),
    Buffer.from(right.signing.claim, "utf8"),
  ));
  const bindings = [];
  for (const entry of entries) {
    bindings.push(await createTranscriptKemKeyBinding({
      keyBindingVersion: "1",
      member: entry.signing.claim,
      keyId: KEY_ID,
      kem: "ml-kem-768",
      publicKey: Buffer.from(entry.kem.publicKey).toString("base64url"),
      validFrom: 1_800_000_000_000,
      expiresAt: 2_000_000_000_000,
    }, {
      signer: entry.signing.claim,
      algorithm: "ed25519",
      sign: (payload) => sign(null, payload, entry.signing.privateKey),
    }));
  }
  const transcript = {
    authenticatedTranscriptVersion: "1",
    jobId: "job-transcript-suite-vector",
    channelId: CHANNEL_ID,
    members: bindings.map(({ member }) => member),
    messages: [],
    generatedAt: 1_899_999_999_000,
    signatures: [],
  };
  const resolver = (claim) => {
    const entry = entries.find(({ signing: authority }) => authority.claim === claim);
    return entry ? { algorithm: "ed25519", publicKey: entry.signing.publicKey } : null;
  };
  const envelope = await sealEncryptedChannelTranscript({
    transcript,
    channelId: CHANNEL_ID,
    recipientBindings: bindings,
    authority: {
      authenticatedAt: AUTHENTICATED_AT,
      resolveSigningKey: resolver,
      resolveKeyStatus: () => "current",
    },
    deterministicRandomnessForTestingOnly: {
      cek: fromHex(INPUTS.randomness.cek),
      iv: fromHex(INPUTS.randomness.iv),
      wraps: bindings.map((binding, index) => ({
        member: binding.member,
        keyId: binding.keyId,
        encapsulation: fromHex(INPUTS.randomness.encapsulations[index]),
        iv: fromHex(INPUTS.randomness.wrapIvs[index]),
      })),
    },
  });
  return {
    vectorVersion: "0.1",
    profile: {
      suiteId: envelope.suiteId,
      suiteVersion: envelope.suiteVersion,
      implementation: "@kynesyslabs/demos-native/transcript-encryption",
    },
    authenticatedAt: AUTHENTICATED_AT,
    inputs: INPUTS,
    identities: Object.fromEntries(entries.map(({ name, signing: authority }) => [
      name,
      { claim: authority.claim, publicKey: authority.publicKey.toString("hex") },
    ])),
    transcript,
    envelope,
    expected: {
      memberSetHash: envelope.memberSetHash,
      recipientBindingsHash: envelope.recipientBindingsHash,
      plaintextHash: envelope.plaintextHash,
      contentHash: envelope.contentHash,
      ciphertext: envelope.ciphertext,
      tag: envelope.tag,
    },
  };
}

export async function serializeTranscriptEncryptionVector() {
  return `${JSON.stringify(await generateTranscriptEncryptionVector(), null, 2)}\n`;
}

async function main() {
  const generated = await serializeTranscriptEncryptionVector();
  if (process.argv[2] === "--check") {
    if (readFileSync(VECTOR_URL, "utf8") !== generated) {
      throw new Error(`vector differs: ${fileURLToPath(VECTOR_URL)}`);
    }
    console.log(`vector is current: ${fileURLToPath(VECTOR_URL)}`);
    return;
  }
  if (process.argv.length !== 2) throw new Error("usage: generate-transcript-encryption-vectors.mjs [--check]");
  writeFileSync(VECTOR_URL, generated);
  console.log(`wrote ${fileURLToPath(VECTOR_URL)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
