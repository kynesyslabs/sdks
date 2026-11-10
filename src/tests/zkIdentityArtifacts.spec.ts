import { createHash } from "crypto"
import { loadArtifact, PinnedArtifact } from "@/encryption/zK/identity/artifacts"

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex")

function serve(responses: Array<Uint8Array | number>) {
    const fetchMock = jest.fn(async () => {
        const next = responses.shift()
        return typeof next === "number"
            ? new Response(null, { status: next, statusText: "Unavailable" })
            : new Response(next as BodyInit, { status: 200 })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    return fetchMock
}

let seq = 0
const artifactFor = (data: Uint8Array): PinnedArtifact => ({
    url: `https://example.test/artifact-${++seq}`,
    sha256: sha256(data),
})

describe("identity circuit artifacts", () => {
    const realFetch = globalThis.fetch
    afterEach(() => {
        globalThis.fetch = realFetch
    })

    it("returns the bytes that match the pinned digest and downloads them once", async () => {
        const data = new Uint8Array([1, 2, 3])
        const artifact = artifactFor(data)
        const fetchMock = serve([data])
        expect(await loadArtifact(artifact)).toEqual(data)
        expect(await loadArtifact(artifact)).toEqual(data)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("refuses a file whose digest differs from the pin", async () => {
        const artifact = artifactFor(new Uint8Array([1, 2, 3]))
        serve([new Uint8Array([1, 2, 4])])
        await expect(loadArtifact(artifact)).rejects.toThrow(`expected ${artifact.sha256}`)
    })

    it("retries after a failed download instead of caching the failure", async () => {
        const data = new Uint8Array([5, 6])
        const artifact = artifactFor(data)
        const fetchMock = serve([503, data])
        await expect(loadArtifact(artifact)).rejects.toThrow("503")
        expect(await loadArtifact(artifact)).toEqual(data)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })
})

describe("identity circuit artifacts without WebCrypto or Node crypto", () => {
    beforeAll(() => {
        jest.resetModules()
        jest.doMock("crypto", () => {
            throw new Error("crypto is not bundled for browsers")
        })
    })
    afterAll(() => jest.dontMock("crypto"))
    const realFetch = globalThis.fetch
    const realCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto")
    afterEach(() => {
        globalThis.fetch = realFetch
        if (realCrypto) Object.defineProperty(globalThis, "crypto", realCrypto)
    })

    it("still checks the digest", async () => {
        Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true })
        const { loadArtifact } = await import("@/encryption/zK/identity/artifacts")
        const data = new Uint8Array([7, 8, 9])
        const artifact = artifactFor(data)
        serve([data])
        expect(await loadArtifact(artifact)).toEqual(data)
        const other = artifactFor(new Uint8Array([7, 8, 9, 10]))
        serve([data])
        await expect(loadArtifact(other)).rejects.toThrow(`expected ${other.sha256}`)
    })
})
