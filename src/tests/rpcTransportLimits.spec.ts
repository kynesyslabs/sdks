import http from "http"
import type { AddressInfo } from "net"
import axios, { AxiosAdapter, CanceledError } from "axios"
import { Demos, TransportError } from "@/websdk"
import { DemosTransactions } from "@/websdk/DemosTransactions"

/**
 * `_doPost` is the one transport every RPC goes through. These tests run it
 * against a local fake node that misbehaves the way a stuck or hostile node
 * can: it never answers, it trickles bytes forever, or it sends far more than
 * any RPC reply should be.
 */

type Handler = (
    req: http.IncomingMessage,
    body: any,
    res: http.ServerResponse,
) => void

async function fakeNode(handler: Handler) {
    let posts = 0
    const timers = new Set<NodeJS.Timeout>()
    const server = http.createServer((req, res) => {
        let raw = ""
        req.on("data", chunk => (raw += chunk))
        req.on("end", () => {
            if (req.method === "POST") posts++
            handler(req, raw ? JSON.parse(raw) : null, res)
        })
    })
    await new Promise<void>(resolve =>
        server.listen(0, "127.0.0.1", () => resolve()),
    )
    const { port } = server.address() as AddressInfo
    return {
        url: `http://127.0.0.1:${port}`,
        get posts() {
            return posts
        },
        every(ms: number, fn: () => void) {
            const t = setInterval(fn, ms)
            timers.add(t)
            return t
        },
        close() {
            timers.forEach(t => clearInterval(t))
            server.closeAllConnections()
            return new Promise<void>(resolve => server.close(() => resolve()))
        },
    }
}

type FakeNode = Awaited<ReturnType<typeof fakeNode>>

const NODE_REPLY = {
    result: 200,
    response: 7,
    require_reply: false,
    extra: null,
}
const answer = (_req, _body, res: http.ServerResponse) =>
    res.end(JSON.stringify(NODE_REPLY))
const neverAnswer = () => undefined

function doPost(url: string, opts: Record<string, unknown> = {}) {
    return (new Demos() as any)._doPost(
        url,
        { method: "nodeCall", params: [] },
        { "Content-Type": "application/json" },
        opts,
    )
}

let nodes: FakeNode[] = []
async function startNode(handler: Handler) {
    const node = await fakeNode(handler)
    nodes.push(node)
    return node
}

const defaultAdapter = axios.defaults.adapter
const defaultTimeout = (Demos as any)._RPC_TIMEOUT_MS
const defaultMaxBytes = (Demos as any)._RPC_MAX_RESPONSE_BYTES

afterEach(async () => {
    axios.defaults.adapter = defaultAdapter
    ;(Demos as any)._RPC_TIMEOUT_MS = defaultTimeout
    ;(Demos as any)._RPC_MAX_RESPONSE_BYTES = defaultMaxBytes
    await Promise.all(nodes.map(node => node.close()))
    nodes = []
})

describe.each(["http", "fetch"])(
    "_doPost limits on the %s adapter",
    adapter => {
        beforeEach(() => {
            axios.defaults.adapter = adapter as any
        })

        it("rejects a node that never answers once the deadline passes", async () => {
            const node = await startNode(neverAnswer)
            const started = Date.now()

            const err = await doPost(node.url, { timeoutMs: 300 }).catch(e => e)

            expect(err).toBeInstanceOf(TransportError)
            expect(err.cause.code).toBe("ECONNABORTED")
            expect(err.message).toMatch(/ECONNABORTED/)
            expect(Date.now() - started).toBeLessThan(3_000)
            // A timed-out attempt may already have reached the node, so it is
            // not sent again.
            expect(err.attempts).toBe(1)
            expect(node.posts).toBe(1)
        }, 8_000)

        it("rejects a reply that keeps trickling in past the deadline", async () => {
            const node = await startNode((_req, _body, res) => {
                res.writeHead(200, { "Content-Type": "application/json" })
                res.write("{")
                node.every(50, () => res.write(" "))
            })

            const err = await doPost(node.url, { timeoutMs: 400 }).catch(e => e)

            expect(err).toBeInstanceOf(TransportError)
            expect(err.cause.code).toBe("ECONNABORTED")
        }, 8_000)

        it("rejects a reply larger than the size cap", async () => {
            const node = await startNode((_req, _body, res) =>
                res.end(
                    JSON.stringify({
                        result: 200,
                        response: "x".repeat(64 * 1024),
                    }),
                ),
            )

            const err = await doPost(node.url, {
                maxResponseBytes: 1024,
            }).catch(e => e)

            expect(err).toBeInstanceOf(TransportError)
            expect(err.cause.code).toBe("ERR_BAD_RESPONSE")
            expect(err.cause.message).toMatch(/maxContentLength size of 1024/)
            expect(err.attempts).toBe(1)
        }, 8_000)

        // axios gives every HTTP 5xx reply the same code as an oversize one,
        // so callers tell them apart by the missing response and the message.
        it("tells an oversize reply apart from a 5xx reply", async () => {
            const big = await startNode((_req, _body, res) =>
                res.end(
                    JSON.stringify({
                        result: 200,
                        response: "x".repeat(64 * 1024),
                    }),
                ),
            )
            const down = await startNode((_req, _body, res) => {
                res.statusCode = 503
                res.end("unavailable")
            })

            const oversize = await doPost(big.url, {
                maxResponseBytes: 1024,
            }).catch(e => e)
            const outage = await doPost(down.url, { retries: 0 }).catch(e => e)

            expect(oversize).toBeInstanceOf(TransportError)
            expect(oversize.cause.code).toBe("ERR_BAD_RESPONSE")
            expect(oversize.cause.response).toBeUndefined()
            expect(oversize.cause.message).toMatch(/^maxContentLength size of /)
            expect(outage).toBeInstanceOf(TransportError)
            expect(outage.cause.code).toBe("ERR_BAD_RESPONSE")
            expect(outage.cause.response.status).toBe(503)
            expect(outage.cause.message).not.toMatch(/^maxContentLength size of /)
        }, 8_000)

        it("stops an endless streamed reply at the size cap", async () => {
            const node = await startNode((_req, _body, res) => {
                res.writeHead(200, { "Content-Type": "application/json" })
                node.every(5, () => res.write("x".repeat(16 * 1024)))
            })

            const err = await doPost(node.url, {
                maxResponseBytes: 1024,
                timeoutMs: 30_000,
            }).catch(e => e)

            expect(err).toBeInstanceOf(TransportError)
            expect(err.cause.code).toBe("ERR_BAD_RESPONSE")
        }, 8_000)

        it("returns a normal reply unchanged under the default limits", async () => {
            const node = await startNode(answer)

            await expect(doPost(node.url)).resolves.toEqual({
                data: NODE_REPLY,
            })
        }, 8_000)

        // axios reads 0 / -1 as "no limit"; Node clamps a timer delay of 0,
        // a negative one, NaN or one past 2^31 - 1 to 1 ms. Taken as given,
        // such an override would fail every call.
        it.each([0, 2 ** 31, -1, NaN])(
            "uses the default deadline for timeoutMs %p",
            async timeoutMs => {
                const node = await startNode(neverAnswer)
                ;(Demos as any)._RPC_TIMEOUT_MS = 300

                const err = await doPost(node.url, { timeoutMs }).catch(e => e)

                expect(err).toBeInstanceOf(TransportError)
                expect(err.cause.code).toBe("ECONNABORTED")
                expect(err.cause.message).toBe("timeout of 300ms exceeded")
            },
            8_000,
        )

        it.each([0, -1, NaN])(
            "uses the default size cap for maxResponseBytes %p",
            async maxResponseBytes => {
                const node = await startNode((_req, _body, res) =>
                    res.end(
                        JSON.stringify({
                            result: 200,
                            response: "x".repeat(64 * 1024),
                        }),
                    ),
                )
                ;(Demos as any)._RPC_MAX_RESPONSE_BYTES = 1024

                const err = await doPost(node.url, { maxResponseBytes }).catch(
                    e => e,
                )

                expect(err).toBeInstanceOf(TransportError)
                expect(err.cause.code).toBe("ERR_BAD_RESPONSE")
                expect(err.cause.message).toMatch(
                    /maxContentLength size of 1024 exceeded/,
                )
            },
            8_000,
        )

        it("returns a normal reply when given out-of-range overrides", async () => {
            const node = await startNode(answer)

            await expect(
                doPost(node.url, { timeoutMs: 0, maxResponseBytes: -1 }),
            ).resolves.toEqual({ data: NODE_REPLY })
        }, 8_000)

        describe("with an abort signal", () => {
            const unavailable: Handler = (_req, _body, res) => {
                res.statusCode = 503
                res.end("unavailable")
            }

            it("stops the attempt in flight when aborted, and does not retry", async () => {
                const ctl = new AbortController()
                // The first post gets a retryable 503; the retry is held open
                // and aborted once it arrives.
                const node = await startNode((req, body, res) => {
                    if (node.posts === 1) return unavailable(req, body, res)
                    ctl.abort()
                })
                const started = Date.now()

                const err = await doPost(node.url, {
                    signal: ctl.signal,
                    retries: 4,
                    baseSleepMs: 10,
                    timeoutMs: 30_000,
                }).catch(e => e)

                expect(err).toBeInstanceOf(TransportError)
                expect(err.cause.code).toBe("ERR_CANCELED")
                expect(err.attempts).toBe(2)
                expect(Date.now() - started).toBeLessThan(3_000)
                await new Promise(r => setTimeout(r, 200))
                expect(node.posts).toBe(2)
            }, 8_000)

            it("sends nothing more when aborted between retries", async () => {
                const ctl = new AbortController()
                const node = await startNode((req, body, res) => {
                    unavailable(req, body, res)
                    // Abort while _doPost sleeps before its retry.
                    setTimeout(() => ctl.abort(), 100)
                })

                const err = await doPost(node.url, {
                    signal: ctl.signal,
                    retries: 4,
                    baseSleepMs: 400,
                }).catch(e => e)

                expect(err).toBeInstanceOf(TransportError)
                expect(err.cause.code).toBe("ERR_CANCELED")
                await new Promise(r => setTimeout(r, 200))
                expect(node.posts).toBe(1)
            }, 8_000)

            it("throws at once, sending nothing, when already aborted", async () => {
                const node = await startNode(answer)
                const ctl = new AbortController()
                ctl.abort()

                const err = await doPost(node.url, {
                    signal: ctl.signal,
                }).catch(e => e)

                expect(err).toBeInstanceOf(TransportError)
                expect(err.cause.code).toBe("ERR_CANCELED")
                expect(node.posts).toBe(0)
            }, 8_000)

            it("leaves no abort listener behind once the call settles", async () => {
                const node = await startNode(answer)
                const ctl = new AbortController()
                const add = jest.spyOn(ctl.signal, "addEventListener")
                const remove = jest.spyOn(ctl.signal, "removeEventListener")

                await expect(
                    doPost(node.url, { signal: ctl.signal }),
                ).resolves.toEqual({ data: NODE_REPLY })
                expect(add).toHaveBeenCalledTimes(1)
                expect(remove).toHaveBeenCalledWith(
                    "abort",
                    add.mock.calls[0][1],
                )
            }, 8_000)
        })
    },
)

describe("_doPost size cap on an adapter that ignores maxContentLength", () => {
    // The browser XHR adapter does not enforce maxContentLength; it only
    // reports download progress and honours the abort signal. Stand in for it.
    const xhrLike: AxiosAdapter = config =>
        new Promise((resolve, reject) => {
            let loaded = 0
            const tick = setInterval(() => {
                loaded += 16 * 1024
                config.onDownloadProgress?.({ loaded, bytes: 16 * 1024 } as any)
                if (loaded >= 4 * 1024 * 1024) {
                    clearInterval(tick)
                    resolve({
                        data: NODE_REPLY,
                        status: 200,
                        statusText: "OK",
                        headers: {},
                        config,
                    })
                }
            }, 1)
            config.signal?.addEventListener?.("abort", () => {
                clearInterval(tick)
                reject(new CanceledError(undefined, undefined, config))
            })
        })

    it("aborts from the download progress once the cap is passed", async () => {
        axios.defaults.adapter = xhrLike

        const err = await doPost("http://127.0.0.1:9", {
            maxResponseBytes: 64 * 1024,
        }).catch(e => e)

        expect(err).toBeInstanceOf(TransportError)
        expect(err.cause.code).toBe("ERR_BAD_RESPONSE")
        expect(err.cause.message).toMatch(/maxContentLength size of 65536/)
        // Same shape as the Node adapters' oversize error: no response, so it
        // is not mistaken for an HTTP 5xx reply.
        expect(err.cause.response).toBeUndefined()
        expect(err.cause.message).toMatch(/^maxContentLength size of /)
    }, 8_000)

    it("reads a size cap of -1 as no limit, as axios does", async () => {
        axios.defaults.adapter = xhrLike
        ;(Demos as any)._RPC_MAX_RESPONSE_BYTES = -1

        await expect(doPost("http://127.0.0.1:9")).resolves.toEqual({
            data: NODE_REPLY,
        })
    }, 8_000)
})

describe("a signal passed to call and rpcCall", () => {
    // The node holds each post open and aborts the caller's signal once it
    // arrives, so only the signal can end the call before the deadline.
    async function heldOpen() {
        const ctl = new AbortController()
        const node = await startNode(() => ctl.abort())
        ;(Demos as any)._RPC_TIMEOUT_MS = 2_000
        const demos = new Demos()
        ;(demos as any).rpc_url = node.url
        return { ctl, node, demos }
    }

    it("cancels a call() request", async () => {
        const { ctl, node, demos } = await heldOpen()

        const envelope: any = await demos.call(
            "nodeCall",
            "getTransactionStatus",
            { hash: "a".repeat(64) },
            "",
            null,
            null,
            { signal: ctl.signal },
        )

        expect(envelope.result).toBe(500)
        expect(envelope.response).toBeInstanceOf(TransportError)
        expect(envelope.response.cause.code).toBe("ERR_CANCELED")
        expect(node.posts).toBe(1)
    }, 8_000)

    it("cancels an rpcCall() request", async () => {
        const { ctl, node, demos } = await heldOpen()
        const log = jest.spyOn(console, "error").mockImplementation(() => {})

        const envelope: any = await demos.rpcCall(
            { method: "nodeCall", params: [] },
            false,
            0,
            250,
            [],
            { signal: ctl.signal },
        )
        log.mockRestore()

        expect(envelope.result).toBe(500)
        expect(envelope.response).toBeInstanceOf(TransportError)
        expect(envelope.response.cause.code).toBe("ERR_CANCELED")
        expect(node.posts).toBe(1)
    }, 8_000)
})

describe("the default deadline on public calls", () => {
    it("settles getAddressNonce when the node never answers", async () => {
        const node = await startNode(neverAnswer)
        ;(Demos as any)._RPC_TIMEOUT_MS = 300
        const demos = new Demos()
        ;(demos as any).rpc_url = node.url

        const envelope: any = await demos.nodeCall("getAddressNonce", {
            address: "0x" + "ab".repeat(32),
        })
        expect(envelope.result).toBe(500)
        expect(envelope.response).toBeInstanceOf(TransportError)
        expect(envelope.response.cause.code).toBe("ECONNABORTED")

        // A failed lookup throws: defaulting to 0 would sign with nonce 1.
        await expect(
            demos.getAddressNonce("0x" + "ab".repeat(32)),
        ).rejects.toThrow(/getAddressNonce: node returned no valid nonce/)
    }, 8_000)

    it("reads a normal reply unchanged", async () => {
        const node = await startNode(answer)
        const demos = new Demos()
        ;(demos as any).rpc_url = node.url

        await expect(
            demos.getAddressNonce("0x" + "ab".repeat(32)),
        ).resolves.toBe(7)
    }, 8_000)

    it("does not resend a broadcast that timed out, and broadcastAndWait polls for its outcome", async () => {
        let executes = 0
        const node = await startNode((req, body, res) => {
            if (req.method === "GET") {
                res.end("ok")
            } else if (body.method === "execute") {
                executes++ // never answers
            } else {
                res.end(
                    JSON.stringify({
                        result: 200,
                        response: { state: "included", blockNumber: 9 },
                    }),
                )
            }
        })
        ;(Demos as any)._RPC_TIMEOUT_MS = 300
        const demos = new Demos()
        await demos.connect(node.url)
        await demos.connectWallet(demos.newMnemonic())
        const validityData = {
            response: {
                data: {
                    valid: true,
                    message: "",
                    transaction: { hash: "a".repeat(64) },
                },
            },
        } as any

        const res = await DemosTransactions.broadcastAndWait(
            validityData,
            demos,
            {
                timeoutMs: 5_000,
                pollIntervalMs: 10,
            },
        )

        // The deadline is an unknown outcome, not "never reached the node":
        // the broadcast is sent once and the status poll decides.
        expect(res.status).toEqual({ state: "included", blockNumber: 9 })
        expect(res.broadcast.result).toBe(500)
        expect((res.broadcast as any).response).toBeInstanceOf(TransportError)
        expect((res.broadcast as any).response.cause.code).toBe("ECONNABORTED")
        expect((res.broadcast as any).response.attempts).toBe(1)
        expect(executes).toBe(1)
    }, 15_000)
})
