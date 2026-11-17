// The real worker module uses import.meta, which a CommonJS run cannot load.
jest.mock("@/tlsnotary/spawnWorker", () => ({
    spawnTlsnWorker: () => {
        throw new Error("no worker in tests")
    },
}))

import { createHash, randomBytes } from "crypto"
import http from "http"
import type { AddressInfo } from "net"
import forge from "node-forge"

import { Demos } from "@/websdk"
import { TLSNotary } from "@/tlsnotary/TLSNotary"
import { TLSNotaryService } from "@/tlsnotary/TLSNotaryService"
import { bodyBoundAuthHeaders, nextAuthTimestamp } from "@/websdk/utils/bodyBoundAuth"

/**
 * requestTLSNproxy as a node after kynesyslabs/node#1244 accepts it: signed
 * over the exact body bytes, naming the node as audience, with the
 * tlsn_request hash as token, answered with a session URL ending in the
 * session's secret id.
 *
 * The tlsn_request goes through the SDK's own builder and signer; only the
 * node is stood in for. `Demos.call` answers the transaction path, and the
 * proxy call goes over real HTTP (real axios) to a local server that checks
 * it with `nodeAccepts` below.
 */

const MNEMONIC = "test test test test test test test test test test test junk"
const TARGET = "https://api.github.com/user"
const GENESIS = "d5".repeat(32)

interface Verdict {
    status: number
    error?: string
    /**
     * Where the node refuses: its auth middleware (`rateLimiter.ts`, after
     * `verifySignature`), or its RPC route (`server_rpc.ts`).
     */
    stage?: "auth" | "route"
    sender?: string
    payload?: any
}

/**
 * A port of the node's checks, at node stabilisation b53a29da9, that a
 * requestTLSNproxy call passes before its handler opens a session:
 *
 * - `src/libs/network/verifySignature.ts`, body-bound branch: body-hash is 64
 *   lowercase hex; an audience needs the body-bound form and must be this
 *   node's key (`audienceKey`); the timestamp is within 5 minutes, and a call
 *   naming this node is at most 5 s ahead; the signed message is
 *   `sha256("DEMOS_HTTP_AUTH_V2:<genesis>:<identity>:<ts>:<bodyHash>[:<audience>]")`
 *   (`httpAuthMessage` in `peerHttpAuth.ts`), verified as ed25519 over its
 *   UTF-8 bytes with the key the identity names.
 * - `src/libs/network/server_rpc.ts`: the SHA-256 of the raw body bytes must
 *   equal body-hash, and a `requestTLSNproxy` nodeCall must be body-bound
 *   and audience-bound.
 * - `src/features/tlsnotary/proxyAccess.ts`: a non-empty `owner` must be the
 *   signer, and the token id must be a tx hash.
 *
 * Hashing here is Node's crypto, as the node's `Hashing` is, and the
 * signature check is node-forge: none of it is the SDK code under test. The
 * replay cache and the restart floor are left out; they do not depend on
 * how the request is built.
 */
function nodeAccepts(
    rawBody: Buffer,
    headers: http.IncomingHttpHeaders,
    node: { publicKeyHex: string; genesisHash: string },
    now = Date.now(),
): Verdict {
    const sha256 = (data: string | Buffer) =>
        createHash("sha256").update(data).digest("hex")
    const audienceKey = (key: string) => key.toLowerCase().replace(/^0x/, "")
    const header = (name: string) => {
        const value = headers[name]
        return typeof value === "string" ? value : undefined
    }
    const refuse = (status: number, error: string, stage: Verdict["stage"] = "auth"): Verdict => ({
        status,
        error,
        stage,
    })

    const identity = header("identity")
    const signature = header("signature")
    const timestamp = header("timestamp")
    const bodyHash = header("body-hash")
    const audience = header("audience")
    if (!identity || !signature) return refuse(401, "Missing identity or signature")

    const bodyBound = typeof bodyHash === "string"
    if (bodyBound && !/^[0-9a-f]{64}$/.test(bodyHash)) {
        return refuse(401, "Malformed body-hash header")
    }
    const audienceBound = typeof audience === "string"
    if (audienceBound) {
        if (!bodyBound) return refuse(401, "Audience needs a body-bound signature")
        if (audienceKey(audience) !== audienceKey(node.publicKeyHex)) {
            return refuse(401, "Request is for another node")
        }
    }
    if (!timestamp) return refuse(401, "Missing timestamp header")
    const ts = Number(timestamp)
    if (!Number.isFinite(ts)) return refuse(401, "Malformed timestamp header")
    if (Math.abs(now - ts) > 5 * 60 * 1000) {
        return refuse(401, "Auth timestamp outside acceptable window")
    }
    if (bodyBound && audienceBound && ts > now + 5_000) {
        return refuse(401, "Auth timestamp is ahead of this node's clock")
    }

    const [algorithm, keyHex] = identity.split(":")
    if (algorithm !== "ed25519" || !keyHex) return refuse(401, "Unsupported identity")
    let authMessage: string
    if (bodyBound) {
        const base = `DEMOS_HTTP_AUTH_V2:${node.genesisHash}:${identity}:${timestamp}:${bodyHash}`
        authMessage = sha256(audienceBound ? `${base}:${audienceKey(audience)}` : base)
    } else {
        authMessage = sha256(`${identity}:${timestamp}`)
    }
    const valid = forge.pki.ed25519.verify({
        message: Buffer.from(authMessage, "utf8"),
        signature: Buffer.from(signature.replace(/^0x/, ""), "hex") as any,
        publicKey: Buffer.from(keyHex.replace(/^0x/, ""), "hex") as any,
    })
    if (!valid) return refuse(401, "Invalid signature")

    if (bodyBound && sha256(rawBody) !== bodyHash) {
        return refuse(401, "Request body does not match the signed body hash", "route")
    }
    const payload = JSON.parse(rawBody.toString("utf8"))
    const call = payload?.method === "nodeCall" ? payload.params?.[0] : undefined
    if (call?.message === "requestTLSNproxy" && !(bodyBound && audienceBound)) {
        return refuse(
            401,
            "requestTLSNproxy requires a body-bound signature naming this node as the audience",
            "route",
        )
    }

    const sender = "0x" + audienceKey(keyHex)
    const owner = call?.data?.owner
    if (owner !== undefined && owner !== null && owner !== "") {
        if (typeof owner !== "string" || audienceKey(owner) !== audienceKey(sender)) {
            return refuse(403, "owner is not the signer of this request", "route")
        }
    }
    const tokenId = call?.data?.tokenId
    if (
        typeof tokenId !== "string" ||
        !/^[0-9a-f]{64}$/.test(tokenId.trim().toLowerCase().replace(/^0x/, ""))
    ) {
        return refuse(400, "tokenId must be the hash of a tlsn_request (64 hex characters)", "route")
    }
    return { status: 200, sender, payload }
}

/** The node's own key, and what it serves at /publickey. */
type NodeKeys = { own: string; served: string }

interface StubNode {
    url: string
    keys: NodeKeys
    sessionId: string
    /** Answer /genesisBlock with this many bytes of padding. */
    genesisPadding: number
    received: { body: Buffer; headers: http.IncomingHttpHeaders; verdict: ReturnType<typeof nodeAccepts> }[]
    close(): Promise<void>
}

function nodeKey(): string {
    return Buffer.from(forge.pki.ed25519.generateKeyPair().publicKey).toString("hex")
}

async function stubNode(): Promise<StubNode> {
    const own = nodeKey()
    const node: Omit<StubNode, "url" | "close"> = {
        keys: { own, served: "0x" + own },
        sessionId: randomBytes(32).toString("hex"),
        genesisPadding: 0,
        received: [],
    }
    const server = http.createServer((req, res) => {
        const chunks: Buffer[] = []
        req.on("data", chunk => chunks.push(chunk))
        req.on("end", () => {
            const json = (status: number, body: unknown) => {
                res.writeHead(status, { "Content-Type": "application/json" })
                res.end(JSON.stringify(body))
            }
            if (req.method === "GET" && req.url === "/") return json(200, { message: "Hello, World!" })
            if (req.method === "GET" && req.url === "/publickey") return json(200, node.keys.served)
            if (req.method === "GET" && req.url === "/genesisBlock") {
                return json(200, { hash: GENESIS, padding: "x".repeat(node.genesisPadding) })
            }
            if (req.method !== "POST") return json(404, {})

            const body = Buffer.concat(chunks)
            const verdict = nodeAccepts(body, req.headers, {
                publicKeyHex: node.keys.own,
                genesisHash: GENESIS,
            })
            node.received.push({ body, headers: req.headers, verdict })
            // The two shapes the node answers a refused signature with.
            if (verdict.stage === "auth") {
                return json(401, { error: "Invalid signature", details: verdict.error })
            }
            if (verdict.status === 401) {
                return json(401, { result: 401, response: verdict.error, require_reply: false, extra: null })
            }
            if (verdict.status !== 200) {
                // Handler refusals come back as HTTP 200 with the status in the body.
                return json(200, {
                    result: verdict.status,
                    response: { status: verdict.status, error: "REFUSED", message: verdict.error },
                    require_reply: false,
                    extra: null,
                })
            }
            const host = req.headers.host
            return json(200, {
                result: 200,
                response: {
                    websocketProxyUrl: `ws://${host}/tlsn/55001/${node.sessionId}`,
                    targetDomain: new URL(TARGET).hostname,
                    expiresIn: 120_000,
                    proxyId: "p-1",
                    maxSentBytes: 32_768,
                    maxRecvBytes: 262_144,
                    tokenId: verdict.payload.params[0].data.tokenId,
                    retriesLeft: 2,
                },
                require_reply: false,
                extra: null,
            })
        })
    })
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
    const { port } = server.address() as AddressInfo
    // The same object the server reads, so tests can change its answers.
    return Object.assign(node, {
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>(resolve => server.close(() => resolve())),
    })
}

/** A connected Demos whose transaction path is answered in process. */
async function connectedDemos(rpcUrl: string) {
    const demos = new Demos()
    await demos.connect(rpcUrl)
    const executed: any[] = []
    const statuses = ["pending", "included"]
    ;(demos as any).call = jest.fn(async (method: string, message: string, data: any, extra: string) => {
        if (method === "execute") {
            if (extra === "confirmTx") {
                executed.push(data)
                return { result: 200, response: { data: { valid: true, message: "", transaction: data } } }
            }
            return { result: 200, response: { message: "accepted" } }
        }
        switch (message) {
            case "getNetworkInfo":
                return {
                    chainId: 1,
                    forks: {
                        osDenomination: { activated: true, activationHeight: 0, currentHeight: 10 },
                        tlsnProofEnforcement: { activated: true, activationHeight: 0, currentHeight: 10 },
                        tlsnVerified: { activated: true, activationHeight: 0, currentHeight: 10 },
                    },
                }
            case "getAddressNonce":
                return 4
            case "getTransactionStatus":
                return { state: statuses.shift() ?? "included", blockNumber: 11 }
            case "tlsnotary.getInfo":
                return { notaryUrl: "https://notary.example", publicKey: "02" + "5a".repeat(32), version: "0.1.0" }
            default:
                return null
        }
    })
    await demos.connectWallet(MNEMONIC, { algorithm: "ed25519" })
    const { publicKey } = await demos.crypto.getIdentity("ed25519")
    const sender = "0x" + Buffer.from(publicKey as Uint8Array).toString("hex")
    return { demos, executed, sender }
}

const fast = { pollIntervalMs: 1, inclusionTimeoutMs: 500 }

let node: StubNode
beforeEach(async () => {
    node = await stubNode()
})
afterEach(async () => {
    await node.close()
})
// GCRGeneration logs every native payload it sees.
beforeAll(() => {
    jest.spyOn(console, "log").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
})

describe("requestTLSNproxy through TLSNotaryService", () => {
    it("is signed over its exact body for this node and accepted", async () => {
        const { demos, sender } = await connectedDemos(node.url)
        await new TLSNotaryService(demos).requestAttestation({ targetUrl: TARGET, ...fast })

        expect(node.received).toHaveLength(1)
        const [call] = node.received
        expect(call.verdict).toMatchObject({ status: 200, sender })
        expect(call.headers["audience"]).toBe(node.keys.own)
        expect(call.headers["identity"]).toBe(`ed25519:${sender}`)
        expect(call.verdict.payload).toEqual({
            method: "nodeCall",
            params: [{ message: "requestTLSNproxy", data: expect.any(Object) }],
        })
    })

    it("sends the included tlsn_request's hash as the token and no owner", async () => {
        const { demos, executed } = await connectedDemos(node.url)
        const token = await new TLSNotaryService(demos).requestAttestation({ targetUrl: TARGET, ...fast })

        const tx = executed[0]
        expect(tx.content.data[1]).toEqual({ nativeOperation: "tlsn_request", args: [TARGET] })
        const data = node.received[0].verdict.payload.params[0].data
        expect(data).toEqual({ tokenId: tx.hash, targetUrl: TARGET })
        expect(data.tokenId).toMatch(/^[0-9a-f]{64}$/)
        expect(token.tokenId).toBe(tx.hash)
    })

    it("keeps the session id in the websocket URL the node returned", async () => {
        const { demos } = await connectedDemos(node.url)
        const initialize = jest.spyOn(TLSNotary.prototype, "initialize").mockResolvedValue(undefined)
        try {
            const { tlsn, proxyUrl } = await new TLSNotaryService(demos).createTLSNotary({
                targetUrl: TARGET,
                ...fast,
            })
            const expected = `${node.url.replace("http", "ws")}/tlsn/55001/${node.sessionId}`
            expect(proxyUrl).toBe(expected)
            expect(new URL(proxyUrl).pathname.split("/").filter(Boolean).pop()).toBe(node.sessionId)
            expect(tlsn.getConfig().websocketProxyUrl).toBe(expected)
            expect(tlsn.getConfig().rpcUrl).toBeUndefined()
        } finally {
            initialize.mockRestore()
        }
    })

    it("fails with the node's reason when the call names another node", async () => {
        // /publickey answered by another node than the one that gets the call,
        // as behind a load balancer without stickiness.
        node.keys.served = nodeKey()
        const { demos } = await connectedDemos(node.url)
        await expect(
            new TLSNotaryService(demos).requestAttestation({ targetUrl: TARGET, ...fast }),
        ).rejects.toThrow(/HTTP 401.*another node/)
        expect(node.received.map(r => r.verdict.status)).toEqual([401])
    })
})

describe("node discovery for a body-bound call", () => {
    it("refuses an oversized genesis block reply instead of reading it whole", async () => {
        node.genesisPadding = 2 * 1024 * 1024
        const { demos } = await connectedDemos(node.url)
        await expect(demos.bodyBoundNodeCall("requestTLSNproxy", {})).rejects.toThrow(
            /genesisBlock failed: maxContentLength/,
        )
        expect(node.received).toHaveLength(0)
    })
})

describe("a body-bound request from the SDK builder and signer", () => {
    async function signed(audience: string | undefined, data: Record<string, unknown>) {
        const { demos, sender } = await connectedDemos(node.url)
        const body = JSON.stringify({
            method: "nodeCall",
            params: [{ message: "requestTLSNproxy", data }],
        })
        const headers = await bodyBoundAuthHeaders({
            genesisHash: GENESIS,
            identity: `ed25519:${sender}`,
            body,
            audience,
            sign: async bytes => (await demos.crypto.sign("ed25519", bytes)).signature,
        })
        return { body, headers, sender }
    }
    const check = (body: string, headers: Record<string, string>) =>
        nodeAccepts(Buffer.from(body, "utf8"), headers, {
            publicKeyHex: node.keys.own,
            genesisHash: GENESIS,
        })
    const proxyData = { tokenId: "ef".repeat(32), targetUrl: TARGET }

    it("verifies against the node's check", async () => {
        const { body, headers, sender } = await signed("0x" + node.keys.own.toUpperCase(), proxyData)
        expect(headers.audience).toBe(node.keys.own)
        expect(check(body, headers)).toMatchObject({ status: 200, sender })
    })

    it("fails for another node's audience", async () => {
        const { body, headers } = await signed(nodeKey(), proxyData)
        expect(check(body, headers)).toMatchObject({ status: 401, error: "Request is for another node" })
    })

    it("fails without an audience", async () => {
        const { body, headers } = await signed(undefined, proxyData)
        expect(check(body, headers).status).toBe(401)
    })

    it("fails when the audience header is swapped after signing", async () => {
        const { body, headers } = await signed(nodeKey(), proxyData)
        expect(check(body, { ...headers, audience: node.keys.own })).toMatchObject({
            status: 401,
            error: "Invalid signature",
        })
    })

    it("fails on an altered body", async () => {
        const { body, headers } = await signed(node.keys.own, proxyData)
        const altered = body.replace(proxyData.tokenId, "cd".repeat(32))
        expect(check(altered, headers).status).toBe(401)
        // Even with body-hash recomputed for the altered body.
        const rehashed = createHash("sha256").update(altered).digest("hex")
        expect(check(altered, { ...headers, "body-hash": rehashed })).toMatchObject({
            status: 401,
            error: "Invalid signature",
        })
    })

    it("fails when only whitespace in the body changes", async () => {
        const { body, headers } = await signed(node.keys.own, proxyData)
        expect(check(body + " ", headers)).toMatchObject({
            status: 401,
            error: "Request body does not match the signed body hash",
        })
    })

    it("fails when signed for another network", async () => {
        const { body, headers } = await signed(node.keys.own, proxyData)
        expect(
            nodeAccepts(Buffer.from(body), headers, {
                publicKeyHex: node.keys.own,
                genesisHash: "e7".repeat(32),
            }),
        ).toMatchObject({ status: 401, error: "Invalid signature" })
    })

    it("gives the same request two timestamps in the same millisecond", () => {
        const now = Date.now()
        expect(nextAuthTimestamp(now)).toBeLessThan(nextAuthTimestamp(now))
    })
})

describe("TLSNotary without a proxy session", () => {
    it("refuses to attest from an rpcUrl, which cannot sign the proxy request", () => {
        const tlsn = new TLSNotary({ notaryUrl: "https://notary.example", rpcUrl: node.url })
        expect(() => (tlsn as any).getProxyUrl()).toThrow(/TLSNotaryService\.createTLSNotary/)
    })
})
