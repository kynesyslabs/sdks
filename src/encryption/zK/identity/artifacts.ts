/**
 * Circuit artifacts for identity proofs: the final keys of the identity
 * ceremony (kynesyslabs/zk_ceremony, BEACON.md). Each file is pinned by commit
 * and by SHA-256, and a download that does not match is refused: a different
 * proving key yields proofs the node rejects, and a swapped circuit could leak
 * the secret into a public signal.
 */

import { createHash } from "crypto"

const CEREMONY_COMMIT = "a03628e63e939c2c05c6659a1b277c9a7b186fc6"
const BASE_URL = `https://raw.githubusercontent.com/kynesyslabs/zk_ceremony/${CEREMONY_COMMIT}/final`

export interface PinnedArtifact {
    url: string
    sha256: string
}

export const IDENTITY_ARTIFACTS = {
    wasm: {
        url: `${BASE_URL}/identity_with_merkle.wasm`,
        sha256: "b55958f21696a3095e280cb222756c5fee6beea935aaf5d30c4c906de9d4ade3",
    },
    zkey: {
        url: `${BASE_URL}/identity_with_merkle_final.zkey`,
        sha256: "591c50c67cb669c09874b0a9cb544c678594b0fd4fee612539c86fb0a97bec56",
    },
    vkey: {
        url: `${BASE_URL}/verification_key_merkle.json`,
        sha256: "e02d5858493ffe323d2eb78c67ea02dd1d0f80662f68f702fa8cdda356af41fd",
    },
} as const satisfies Record<string, PinnedArtifact>

const cache = new Map<string, Promise<Uint8Array>>()

// WebCrypto is missing on Node 18 and on insecure browser origins.
async function sha256Hex(data: Uint8Array): Promise<string> {
    if (!globalThis.crypto?.subtle) {
        return createHash("sha256").update(data).digest("hex")
    }
    const digest = await globalThis.crypto.subtle.digest("SHA-256", data as BufferSource)
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")
}

async function fetchVerified(artifact: PinnedArtifact): Promise<Uint8Array> {
    const response = await fetch(artifact.url)
    if (!response.ok) {
        throw new Error(`Failed to load ${artifact.url}: ${response.status} ${response.statusText}`)
    }
    const data = new Uint8Array(await response.arrayBuffer())
    const actual = await sha256Hex(data)
    if (actual !== artifact.sha256) {
        throw new Error(`${artifact.url} has SHA-256 ${actual}, expected ${artifact.sha256}`)
    }
    return data
}

/** Downloads an artifact once per process and checks its digest. A failed download is not cached. */
export function loadArtifact(artifact: PinnedArtifact): Promise<Uint8Array> {
    let pending = cache.get(artifact.url)
    if (!pending) {
        pending = fetchVerified(artifact)
        pending.catch(() => cache.delete(artifact.url))
        cache.set(artifact.url, pending)
    }
    return pending
}
