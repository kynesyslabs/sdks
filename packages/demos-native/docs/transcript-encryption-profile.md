# Candidate DACS encrypted-transcript suite profile

Status: public implementation input to DACS-Standard issue #351. This profile
is not normative DACS-3 until the Standard adopts it. The implemented import is
`@kynesyslabs/demos-native/transcript-encryption`.

## 1. Suite selection and change control

The suite selector is the exact pair:

```json
{
  "suiteId": "dacs-transcript-mlkem768-a256gcm",
  "suiteVersion": 1
}
```

Both values occur in the envelope and authenticated content header. Readers
reject any other ID or version before cryptography. A change to any parameter
in this document requires a new numeric `suiteVersion`; published versions are
immutable.

The envelope version is the independent string discriminator
`envelopeVersion: "1"`. The encrypted plaintext is required to declare
`authenticatedTranscriptVersion: "1"` at the DACS artifact layer.

## 2. Recipient encryption keys

Each fixed CH-1 member supplies exactly one `TranscriptKemKeyBinding`:

```text
{
  keyBindingVersion: "1",
  member: ClaimReference,
  keyId: string,
  kem: "ml-kem-768",
  publicKey: string,
  validFrom: number,
  expiresAt: number,
  keySig: ChannelMessageSignature
}
```

- `member` is already in CORE CF-2 canonical byte form.
- `keyId` is a non-empty NFC string. It identifies a rotation of this member's
  KEM key; it need not be globally unique across different members.
- `publicKey` is the 1,184-byte FIPS 203 ML-KEM-768 encapsulation key, encoded
  as canonical unpadded Base64URL.
- `validFrom` is inclusive and `expiresAt` is exclusive. Both are non-negative
  safe-integer Unix milliseconds and `expiresAt > validFrom`.
- `keySig.signer` equals `member`. Its algorithm and value use the same closed
  algorithm set and validation rules as the candidate channel codec.

The member signs the binding without `keySig` over:

```text
UTF8("dacs-transcript-kem-key:v1:") ||
ASCII(lowercase_hex(sha256(UTF8(JCS(unsigned_binding)))))
```

`keySig.value` is the raw signature in canonical unpadded Base64URL. The
authenticated member signing-key resolver chooses and parses the key; no
algorithm or key fallback is attempted.

Before encryption or decryption, the caller supplies authenticated substrate
time and a `resolveKeyStatus(binding, authenticatedAt)` decision. `revoked`
fails, `indeterminate` remains indeterminate, and only `current` inside the
signed validity window proceeds. This hook must be backed by the deployment's
authenticated key/revocation registry, not a self-declared envelope timestamp.
A rotation creates a new `keyId`, key pair, signed binding,
`recipientBindingsHash`, ciphertext envelope and anchor. Rewrapping an old
envelope in place is forbidden.

Key generation uses `ML-KEM-768.KeyGen(seed)`, where `seed` is exactly 64 fresh
CSPRNG bytes. The public API also accepts an explicit 64-byte seed solely for
deterministic provisioning and conformance vectors. A KEM secret key is 2,400
bytes and is never placed in an envelope.

## 3. Canonical recipient roster

Bindings form a duplicate-free bijection with the transcript's fixed member
roster. They are ordered by bytewise comparison of `UTF8(CF-2(member))`.
`wraps` has the same length and order, and every entry repeats the exact
`{member, keyId}` coordinate. A missing, additional, duplicate or reordered
binding/wrap is malformed before cryptography.

```text
memberSetHash := lowercase_hex(sha256(UTF8(JCS(ordered_members))))
recipientBindingsHash :=
  lowercase_hex(sha256(UTF8(JCS(ordered_signed_key_bindings))))
```

Including the complete signed bindings commits the key ID, bytes, validity
window and authorization signature.

## 4. KEM, CEK wrapping and KDF

For each ordered recipient `i`:

```text
(kemCiphertext_i, sharedSecret_i) :=
  ML-KEM-768.Encaps(publicKey_i, encapsulation_randomness_i)
```

- encapsulation randomness: 32 fresh CSPRNG bytes;
- KEM ciphertext: 1,088 bytes, canonical unpadded Base64URL on wire;
- shared secret: 32 bytes;
- wrap KDF: none. The uniform ML-KEM shared secret is used directly as the
  AES-256-GCM wrap key, matching the Demos Enigma primitive;
- wrap IV: 12 fresh CSPRNG bytes;
- wrap AEAD AAD: empty;
- wrapped plaintext: the single-use 32-byte content-encryption key (CEK);
- wrap tag: 16 bytes.

The exact `wrapped` wire field is canonical unpadded Base64URL of:

```text
raw(wrapIv_i) || raw(encryptedCek_i) || raw(wrapTag_i)
```

It is therefore exactly 60 decoded bytes. `kemCiphertext` is a separate field.
ML-KEM implicit rejection followed by GCM authentication makes a wrong secret
key a step-5 failure. The implementation never tries another recipient or key.

## 5. Plaintext, header, AAD and content encryption

The plaintext bytes are exactly:

```text
plaintext := UTF8(JCS(AuthenticatedChannelTranscript))
plaintextHash := lowercase_hex(sha256(plaintext))
```

CORE CF-1 values-only NFC normalization occurs as part of the package's DACS
canonicalizer. Member names and unknown signed fields are retained.

The exact content header is:

```text
{
  suiteId,
  suiteVersion,
  transcriptVersion: "1",
  channelId,
  memberSetHash,
  recipientBindingsHash,
  plaintextHash
}
```

The content encryption parameters are:

- AEAD: AES-256-GCM;
- CEK: 32 fresh CSPRNG bytes, single-use per envelope;
- IV: 12 fresh CSPRNG bytes;
- tag: 16 bytes;
- AAD: exactly `UTF8(JCS(header))`, with no newline or framing byte;
- ciphertext: the variable-length GCM ciphertext without the tag.

`iv`, `ciphertext` and `tag` are separate canonical unpadded Base64URL fields.
Random CEKs and IVs must never be caller-reused. The
`deterministicRandomnessForTestingOnly` input exists for tests and controlled
vector generation only.

## 6. Public byte commitment

The public content commitment covers the authenticated header, ordered wraps
and decoded content bytes:

```text
contentHash := lowercase_hex(sha256(
  UTF8(JCS(header)) ||
  UTF8(JCS(wraps)) ||
  raw(iv) || raw(ciphertext) || raw(tag)
))
```

`raw` means strict canonical Base64URL decoding. The strings themselves are
not hashed in those three positions. A wrap mutation, ciphertext mutation,
tag mutation or unrehashed header mutation fails this check before
decapsulation. `contentHash` is an unkeyed commitment, not an authorization
signature; the future DACS envelope signature and SR-2 receipt must bind the
complete envelope.

## 7. Envelope

```text
{
  envelopeVersion: "1",
  suiteId,
  suiteVersion,
  channelId,
  memberSetHash,
  recipientBindingsHash,
  plaintextHash,
  recipientBindings: TranscriptKemKeyBinding[],
  wraps: { member, keyId, kemCiphertext, wrapped }[],
  iv,
  ciphertext,
  tag,
  contentHash
}
```

The version-1 envelope has this exact member set. Binary fields use canonical
unpadded Base64URL; hashes are 32-byte lowercase hex. Unsupported versions,
unknown members, non-canonical encodings and invalid sizes are malformed and
do not trigger a second parser or suite.

## 8. Verification and four-value behavior

The executable verifier stops at the first applicable step:

1. Exact shape, suite, versions, canonical strings, encodings, sizes, unique
   ordered binding roster and binding/wrap bijection. Malformed is `error`.
2. Every member `keySig`, validity window and authenticated revocation status.
   Bad/revoked/expired is `fail`; unavailable authority/status is
   `indeterminate`.
3. Recompute `memberSetHash` and `recipientBindingsHash`. Mismatch is `fail`.
4. Recompute `contentHash`. Mismatch is `fail`.
5. Locate only the exact `{member,keyId}` wrap, decapsulate once and
   authenticate the CEK wrap. Missing/wrong recipient or key is `fail`.
6. Authenticate/decrypt content with exact header AAD, decode fatal UTF-8, and
   require one canonical JSON object. Failure is `fail`.
7. Recompute `plaintextHash`. Mismatch is `fail`.
8. Require plaintext `channelId` and ordered `members` to equal the envelope.
   Mismatch is `fail`.

Full DACS use additionally verifies the pinned Listing policy, every canonical
message, the complete all-member transcript signatures, all-member anchor
consent, the signed encrypted-envelope artifact and its authenticated SR-2
receipt. Those artifacts remain controlled by DACS-Standard #351 and are not
silently invented by this suite.

## 9. Golden vector

`test/fixtures/transcript-encryption-v0.1.json` records deterministic Ed25519
member seeds, ML-KEM seeds, CEK, KEM randomness, wrap IVs, content IV, signed
recipient bindings, envelope and exact hashes/ciphertext/tag. Its file SHA-256
is:

```text
e9c8c0a60da017c7d5f33e6c47c811ef77b30c4127258b3ecc78efc3ba5ec95d
```

The checked generator reproduces it byte-for-byte. Executed negative tests
cover wrong recipient, wrong ML-KEM secret, ciphertext and wrap tampering with
and without recomputed public hashes, changed AAD, modified key signature,
revoked/unavailable/expired keys, unsupported suite, and missing/duplicate
recipients.

The design retains the peer proposal at DACS-Standard PR #351 commit
`a176249d429a3cf772938c2cc8fa29909b63302d`—ML-KEM-768, direct shared-secret
wrap key, SDK-compatible 12/ciphertext/16 framing and AES-256-GCM choices. It
adds the numeric suite version, exact key IDs and executable key authorization
that the initial non-normative harness explicitly left open.
