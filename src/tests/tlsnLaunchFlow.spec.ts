// The real worker module uses import.meta, which a CommonJS run cannot load;
// these tests stand in for the worker instead.
jest.mock("@/tlsnotary/spawnWorker", () => ({
    spawnTlsnWorker: () => {
        throw new Error("no worker in tests")
    },
}))

import { Demos } from "@/websdk"
import { TLSNotary } from "@/tlsnotary/TLSNotary"
import { TLSNotaryService } from "@/tlsnotary/TLSNotaryService"
import { NotaryKeyMismatchError } from "@/tlsnotary/notaryKey"
import { buildBindValue, bindHeaderFullyRevealed } from "@/tlsnotary/revealPolicy"
import {
    isTlsnPlaceholder,
    TLSN_MAINNET_CHAIN_ID,
    TLSN_MAINNET_NOTARY_URL,
} from "@/tlsnotary/network"
import type { Range } from "@/tlsnotary/types"

/**
 * The launch flow end to end through the SDK's own builders and signer.
 * Only the node (`Demos.call`) and the prover worker (tlsn-wasm) are stood
 * in for: both sit outside this process in real use.
 */

const MNEMONIC = "test test test test test test test test test test test junk"
const TARGET = "https://api.github.com/user"
// A session URL as nodes return it: the session id is the last segment.
const PROXY = "wss://node.example/tlsn/55001/" + "5e".repeat(32)
const NOTARY_URL = "https://notary.example"
// Test-only key bytes: a compressed-point shape, not a real notary key.
const NOTARY_KEY = "02" + "5a".repeat(32)
const FOREIGN_KEY = "03" + "6b".repeat(32)

type NodeOptions = {
    tlsnVerified?: boolean
    chainId?: number
    /** States getTransactionStatus reports, one per poll; then "pending". */
    statuses?: string[]
    getInfo?: Record<string, unknown> | null
}

async function connectedDemos(options: NodeOptions = {}) {
    const statuses = [...(options.statuses ?? ["pending", "included"])]
    const log: string[] = []
    const executed: any[] = []
    const forks: Record<string, unknown> = {
        osDenomination: { activated: true, activationHeight: 0, currentHeight: 10 },
        tlsnProofEnforcement: { activated: true, activationHeight: 0, currentHeight: 10 },
    }
    if (options.tlsnVerified !== undefined) {
        forks.tlsnVerified = {
            activated: options.tlsnVerified,
            activationHeight: options.tlsnVerified ? 0 : null,
            currentHeight: 10,
        }
    }
    const networkInfo = { forks, chainId: options.chainId ?? 1 }
    const getInfo =
        options.getInfo === undefined
            ? { notaryUrl: NOTARY_URL, publicKey: NOTARY_KEY, proxyUrl: PROXY, version: "0.1.0" }
            : options.getInfo

    const demos = new Demos()
    ;(demos as any).call = jest.fn(
        async (method: string, message: string, data: any, extra: string) => {
            if (method === "execute") {
                log.push(extra)
                if (extra === "confirmTx") {
                    executed.push(data)
                    return {
                        result: 200,
                        response: { data: { valid: true, message: "", transaction: data } },
                    }
                }
                return { result: 200, response: { message: "accepted" } }
            }
            log.push(message)
            switch (message) {
                case "getNetworkInfo":
                    return networkInfo
                case "getLastBlockNumber":
                    return 100
                case "getAddressNonce":
                    return 4
                case "getTransactionStatus":
                    return { state: statuses.shift() ?? "pending", blockNumber: 11 }
                case "tlsnotary.getInfo":
                    return getInfo
                case "tlsnotary.getToken":
                    return { token: { id: "node-local-token" } }
                default:
                    return null
            }
        },
    )
    // requestTLSNproxy is signed over its body (tlsnSignedProxy.spec.ts
    // covers that request); here only its answer matters.
    ;(demos as any).bodyBoundNodeCall = jest.fn(async (message: string) => {
        log.push(message)
        return {
            result: 200,
            response: { websocketProxyUrl: PROXY, expiresIn: 30000, retriesLeft: 3 },
            require_reply: false,
            extra: null,
        }
    })
    await demos.connectWallet(MNEMONIC, { algorithm: "ed25519" })
    demos.connected = true
    const { publicKey } = await demos.crypto.getIdentity("ed25519")
    const sender = "0x" + Buffer.from(publicKey as Uint8Array).toString("hex")
    const nodeCalls = () => [
        ...(demos.call as jest.Mock).mock.calls
            .filter(([method]) => method === "nodeCall")
            .map(([, message, data]) => ({ message, data })),
        ...((demos as any).bodyBoundNodeCall as jest.Mock).mock.calls.map(
            ([message, data]) => ({ message, data }),
        ),
    ]
    return { demos, log, executed, sender, nodeCalls }
}

const fast = { pollIntervalMs: 1, inclusionTimeoutMs: 200 }

// GCRGeneration logs every native payload it sees, proofs included.
beforeAll(() => {
    jest.spyOn(console, "log").mockImplementation(() => {})
})

describe("tlsn_request: inclusion before the proxy", () => {
    it("signs a tlsn_request, waits for inclusion, then asks for the proxy with the tx hash as token", async () => {
        const { demos, log, executed, sender, nodeCalls } = await connectedDemos({
            tlsnVerified: true,
            statuses: ["pending", "pending", "included"],
        })
        const token = await new TLSNotaryService(demos).requestAttestation({
            targetUrl: TARGET,
            ...fast,
        })

        const tx = executed[0]
        expect(tx.content.type).toBe("native")
        expect(tx.content.from).toBe(sender)
        expect(tx.content.data[1]).toEqual({ nativeOperation: "tlsn_request", args: [TARGET] })
        expect(tx.signature?.data).toBeTruthy()
        expect(tx.hash).toMatch(/^[0-9a-f]{64}$/)

        const firstProxy = log.indexOf("requestTLSNproxy")
        const lastPoll = log.lastIndexOf("getTransactionStatus")
        expect(log.filter(m => m === "getTransactionStatus")).toHaveLength(3)
        expect(log.indexOf("broadcastTx")).toBeLessThan(log.indexOf("getTransactionStatus"))
        expect(lastPoll).toBeLessThan(firstProxy)

        const proxyCall = nodeCalls().find(c => c.message === "requestTLSNproxy")!
        expect(proxyCall.data).toEqual({ tokenId: tx.hash, targetUrl: TARGET })
        expect(token).toMatchObject({ tokenId: tx.hash, txHash: tx.hash, owner: sender, proxyUrl: PROXY })
        expect(log).not.toContain("tlsnotary.getToken")
    })

    it("does not ask for a proxy when the request fails on chain", async () => {
        const { demos, log } = await connectedDemos({ tlsnVerified: true, statuses: ["failed"] })
        await expect(
            new TLSNotaryService(demos).requestAttestation({ targetUrl: TARGET, ...fast }),
        ).rejects.toThrow("included as failed")
        expect(log).not.toContain("requestTLSNproxy")
    })

    it("does not ask for a proxy before the request is included", async () => {
        const { demos, log } = await connectedDemos({ tlsnVerified: true, statuses: [] })
        await expect(
            new TLSNotaryService(demos).requestAttestation({
                targetUrl: TARGET,
                pollIntervalMs: 1,
                inclusionTimeoutMs: 20,
            }),
        ).rejects.toThrow("not included")
        expect(log).not.toContain("requestTLSNproxy")
    })

    it("keeps the node-local token id on a network without tlsnVerified, but opens the proxy by the tx hash", async () => {
        const { demos, log, executed, nodeCalls } = await connectedDemos({ tlsnVerified: false })
        const token = await new TLSNotaryService(demos).requestAttestation({
            targetUrl: TARGET,
            ...fast,
        })
        expect(log.indexOf("getTransactionStatus")).toBeLessThan(log.indexOf("tlsnotary.getToken"))
        expect(token.tokenId).toBe("node-local-token")
        expect(nodeCalls().find(c => c.message === "requestTLSNproxy")!.data.tokenId).toBe(
            executed[0].hash,
        )
    })
})

describe("createTLSNotary", () => {
    let initialize: jest.SpyInstance
    beforeEach(() => {
        initialize = jest.spyOn(TLSNotary.prototype, "initialize").mockResolvedValue(undefined)
    })
    afterEach(() => initialize.mockRestore())

    it("binds the instance to the sender, the request hash and the purpose", async () => {
        const { demos, executed, sender } = await connectedDemos({ tlsnVerified: true })
        const { tlsn, tokenId, requestTxHash } = await new TLSNotaryService(demos).createTLSNotary({
            targetUrl: TARGET,
            purpose: "github",
            ...fast,
        })
        const config = tlsn.getConfig()
        expect(requestTxHash).toBe(executed[0].hash)
        expect(tokenId).toBe(executed[0].hash)
        expect(config.binding).toEqual({ purpose: "github", sender, requestTxHash: executed[0].hash })
        expect(config.trustedNotaryKeys).toEqual([NOTARY_KEY])
        expect(config.notaryUrl).toBe(NOTARY_URL)
        expect(config.websocketProxyUrl).toBe(PROXY)
        expect(config.rpcUrl).toBeUndefined()
    })

    it("binds to store by default", async () => {
        const { demos } = await connectedDemos({ tlsnVerified: true })
        const { tlsn } = await new TLSNotaryService(demos).createTLSNotary({
            targetUrl: TARGET,
            ...fast,
        })
        expect(tlsn.getConfig().binding?.purpose).toBe("store")
    })

    // Only meaningful until the key ceremony fills the pins.
    const whilePlaceholder = isTlsnPlaceholder(TLSN_MAINNET_NOTARY_URL) ? it : it.skip
    whilePlaceholder("refuses mainnet before paying while the pinned notary is a placeholder", async () => {
        const { demos, log } = await connectedDemos({
            tlsnVerified: true,
            chainId: TLSN_MAINNET_CHAIN_ID,
        })
        await expect(
            new TLSNotaryService(demos).createTLSNotary({ targetUrl: TARGET, ...fast }),
        ).rejects.toThrow("no mainnet TLSNotary notary pinned")
        expect(log).not.toContain("confirmTx")
        expect(log).not.toContain("broadcastTx")
    })
})

describe("storeProof", () => {
    const presentation = (bytes: number) =>
        JSON.stringify({ version: "0.1.0-alpha.12", data: "ab".repeat(bytes), meta: {} })

    it("signs an on-chain tlsn_store within the size limit", async () => {
        const { demos, executed } = await connectedDemos({
            tlsnVerified: true,
            getInfo: { notaryUrl: NOTARY_URL, publicKey: NOTARY_KEY, maxPresentationBytes: 4096 },
        })
        const proof = presentation(4096)
        const res = await new TLSNotaryService(demos).storeProof("aa".repeat(32), proof, {
            storage: "onchain",
        })
        expect(executed[0].content.data[1]).toEqual({
            nativeOperation: "tlsn_store",
            args: ["aa".repeat(32), proof, "onchain"],
        })
        expect(executed[0].signature?.data).toBeTruthy()
        expect(res.txHash).toBe(executed[0].hash)
    })

    it("refuses a presentation over the node's limit before signing", async () => {
        const { demos, log } = await connectedDemos({
            tlsnVerified: true,
            getInfo: { notaryUrl: NOTARY_URL, publicKey: NOTARY_KEY, maxPresentationBytes: 4096 },
        })
        await expect(
            new TLSNotaryService(demos).storeProof("aa".repeat(32), presentation(4097), {
                storage: "onchain",
            }),
        ).rejects.toThrow("4097 bytes, over the network limit of 4096")
        expect(log).not.toContain("confirmTx")
    })

    it("falls back to the mainnet limit when the node reports none", async () => {
        const { demos, log } = await connectedDemos({ tlsnVerified: true, getInfo: null })
        const service = new TLSNotaryService(demos)
        await expect(
            service.storeProof("aa".repeat(32), presentation(65537), { storage: "onchain" }),
        ).rejects.toThrow("over the network limit of 65536")
        await expect(
            service.storeProof("aa".repeat(32), presentation(10), {
                storage: "onchain",
                maxPresentationBytes: 8,
            }),
        ).rejects.toThrow("over the network limit of 8")
        expect(log).not.toContain("confirmTx")
    })

    it("refuses IPFS storage", async () => {
        const { demos, log } = await connectedDemos({ tlsnVerified: true })
        const service = new TLSNotaryService(demos)
        await expect(
            service.storeProof("aa".repeat(32), presentation(10), { storage: "ipfs" } as any),
        ).rejects.toThrow("on chain only")
        await expect(
            service.storeProofWithConfirmation(
                "aa".repeat(32),
                presentation(10),
                { storage: "ipfs" } as any,
                { onConfirm: async () => true },
            ),
        ).rejects.toThrow("on chain only")
        expect(log).not.toContain("confirmTx")
    })
})

/**
 * A prover worker that sends what tlsn-js would: its Host and Connection
 * defaults merged with the caller's headers, lowercased, in an order that
 * changes per instance (tlsn-wasm keeps them in a HashMap).
 */
function fakeWasm(verifyingKey: string) {
    const provers: any[] = []
    let order = 0
    class Prover {
        request: any
        commit: any
        sent: number[] = []
        recv: number[] = []
        constructor() {
            provers.push(this)
        }
        async setup() {}
        async sendRequest(_proxy: string, request: any) {
            this.request = request
            const url = new URL(request.url)
            const merged: Record<string, string> = {
                Host: url.hostname,
                Connection: "close",
                ...request.headers,
            }
            const entries = Object.entries(merged).map(([n, v]) => [n.toLowerCase(), v])
            const shift = order++ % entries.length
            const rotated = [...entries.slice(shift), ...entries.slice(0, shift)]
            const text =
                `${request.method} ${url.pathname} HTTP/1.1\r\n` +
                rotated.map(([n, v]) => `${n}: ${v}\r\n`).join("") +
                "\r\n"
            this.sent = [...Buffer.from(text, "latin1")]
            const body = '{"login":"octocat","id":583231}'
            this.recv = [
                ...Buffer.from(
                    `HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: ${body.length}\r\n\r\n${body}`,
                    "latin1",
                ),
            ]
            return { status: 200, headers: {} }
        }
        async transcript() {
            return { sent: this.sent, recv: this.recv }
        }
        async notarize(commit: any) {
            this.commit = commit
            return { attestation: "aa", secrets: "bb" }
        }
        async free() {}
    }
    class Presentation {
        async json() {
            return { version: "0.1.0-alpha.12", data: "cd".repeat(8), meta: {} }
        }
        async verify() {
            const p = provers[provers.length - 1]
            return {
                server_name: "api.github.com",
                connection_info: { time: 1_700_000_000 },
                transcript: { sent: p?.sent ?? [], recv: p?.recv ?? [] },
            }
        }
        async verifyingKey() {
            return { alg: "k256", data: [...Buffer.from(verifyingKey, "hex")] }
        }
        async free() {}
    }
    return { wasm: { Prover, Presentation }, provers }
}

function readyTLSNotary(config: Partial<ConstructorParameters<typeof TLSNotary>[0]>, signer: string) {
    const tlsn = new TLSNotary({ notaryUrl: NOTARY_URL, websocketProxyUrl: PROXY, ...config })
    const fake = fakeWasm(signer)
    ;(tlsn as any).wasm = fake.wasm
    ;(tlsn as any).initialized = true
    return { tlsn, provers: fake.provers }
}

describe("attest through the prover", () => {
    const binding = {
        purpose: "github" as const,
        sender: "0x" + "11".repeat(32),
        requestTxHash: "22".repeat(32),
    }
    const covered = (ranges: Range[], bytes: number[], needle: string) => {
        const at = Buffer.from(bytes).indexOf(needle, 0, "latin1")
        return at >= 0 && ranges.some(r => r.start <= at && r.end >= at + needle.length)
    }
    const touched = (ranges: Range[], bytes: number[], needle: string) => {
        const at = Buffer.from(bytes).indexOf(needle, 0, "latin1")
        return ranges.some(r => r.start < at + needle.length && at < r.end)
    }

    beforeEach(() => {
        ;(globalThis as any).fetch = jest.fn(async () => ({
            json: async () => ({ sessionId: "session-1" }),
        }))
    })
    afterEach(() => {
        delete (globalThis as any).fetch
    })

    it("sends the bind header and reveals it whole, the Authorization value never, in every order", async () => {
        const { tlsn, provers } = readyTLSNotary({ binding, trustedNotaryKeys: [NOTARY_KEY] }, NOTARY_KEY)
        const headers = {
            Authorization: "Bearer test-only-NOT-A-REAL-TOKEN",
            Cookie: "session=test-only",
            "User-Agent": "demos-test",
            "X-Demos-Bind": "forged",
        }
        for (let i = 0; i < 7; i++) {
            if (i % 2) await tlsn.attestQuick({ url: TARGET, headers })
            else await tlsn.attest({ url: TARGET, headers })
        }
        const bindPositions = new Set<number>()
        for (const p of provers) {
            const sentHeaders = Object.entries(p.request.headers)
            expect(sentHeaders.filter(([n]) => n.toLowerCase() === "x-demos-bind")).toEqual([
                ["X-Demos-Bind", buildBindValue(binding)],
            ])
            expect(bindHeaderFullyRevealed(p.sent, p.commit.sent)).toBe(true)
            expect(covered(p.commit.sent, p.sent, "GET /user HTTP/1.1\r\n")).toBe(true)
            expect(covered(p.commit.sent, p.sent, "host: api.github.com\r\n")).toBe(true)
            expect(touched(p.commit.sent, p.sent, "Bearer test-only-NOT-A-REAL-TOKEN")).toBe(false)
            expect(touched(p.commit.sent, p.sent, "session=test-only")).toBe(false)
            expect(covered(p.commit.recv, p.recv, '{"login":"octocat","id":583231}')).toBe(true)
            bindPositions.add(Buffer.from(p.sent).indexOf("x-demos-bind", 0, "latin1"))
        }
        expect(bindPositions.size).toBeGreaterThan(1)
    })

    it("refuses a caller range over the Authorization value before notarising", async () => {
        const { tlsn, provers } = readyTLSNotary({ binding, trustedNotaryKeys: [NOTARY_KEY] }, NOTARY_KEY)
        await expect(
            tlsn.attest(
                { url: TARGET, headers: { Authorization: "Bearer test-only-NOT-A-REAL-TOKEN" } },
                { sent: [{ start: 0, end: 200 }], recv: [] },
            ),
        ).rejects.toThrow("authorization")
        expect(provers[0].commit).toBeUndefined()
    })

    it("refuses a presentation signed by a foreign notary key", async () => {
        const { tlsn } = readyTLSNotary({ binding, trustedNotaryKeys: [NOTARY_KEY] }, FOREIGN_KEY)
        await expect(tlsn.attest({ url: TARGET })).rejects.toBeInstanceOf(NotaryKeyMismatchError)
        await expect(
            tlsn.verify({ version: "0.1.0-alpha.12", data: "cd", meta: {} } as any),
        ).rejects.toBeInstanceOf(NotaryKeyMismatchError)
    })

    it("accepts the standby key of a pinned set", async () => {
        const { tlsn } = readyTLSNotary({ trustedNotaryKeys: [FOREIGN_KEY, NOTARY_KEY] }, NOTARY_KEY)
        const result = await tlsn.verify({ version: "0.1.0-alpha.12", data: "cd", meta: {} } as any)
        expect(result.verifyingKey).toBe(NOTARY_KEY)
        expect(result.notaryKey).toBe(NOTARY_KEY)
    })

    it("refuses to verify when no notary key is pinned and none can be read", async () => {
        ;(globalThis as any).fetch = jest.fn(async () => {
            throw new Error("offline")
        })
        const { tlsn } = readyTLSNotary({}, NOTARY_KEY)
        await expect(
            tlsn.verify({ version: "0.1.0-alpha.12", data: "cd", meta: {} } as any),
        ).rejects.toThrow("needs a trusted notary key")
    })
})
