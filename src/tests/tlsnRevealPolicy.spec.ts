import {
    bindHeaderFullyRevealed,
    buildBindValue,
    computeRevealRanges,
    enforceRevealPolicy,
    mergeRanges,
    parseHttpMessage,
    parseHttpResponses,
    TLSN_BIND_HEADER,
    withBindHeader,
} from "@/tlsnotary/revealPolicy"
import type { Range } from "@/tlsnotary/types"

/**
 * tlsn-wasm builds request headers from a HashMap, so their order changes
 * between runs. The transcripts below follow what the prover actually sends
 * (origin-form request line, lowercase names, CRLF lines, as recorded in the
 * W1a spike) and put every header in every position.
 */
const SENDER = "0x" + "11".repeat(32)
const REQUEST_HASH = "22".repeat(32)
const BIND = buildBindValue({
    purpose: "github",
    sender: SENDER,
    requestTxHash: REQUEST_HASH,
})
const BEARER = "Bearer test-only-NOT-A-REAL-TOKEN-0123456789"
const COOKIE = "session=test-only-cookie-value; theme=dark"

const HEADERS: Array<[string, string]> = [
    ["host", "api.github.com"],
    ["accept", "application/json"],
    ["connection", "close"],
    ["authorization", BEARER],
    ["cookie", COOKIE],
    ["x-demos-bind", BIND],
]

const enc = (s: string) => Uint8Array.from(Buffer.from(s, "latin1"))

function request(headers: Array<[string, string]>, line = "GET /user HTTP/1.1"): Uint8Array {
    return enc(
        line + "\r\n" + headers.map(([n, v]) => `${n}: ${v}\r\n`).join("") + "\r\n",
    )
}

const BODY = '{"login":"octocat","id":583231,"name":"The Octocat"}'
const RESPONSE = enc(
    "HTTP/1.1 200 OK\r\n" +
        "Date: Mon, 16 Nov 2026 22:46:27 GMT\r\n" +
        "Content-Type: application/json; charset=utf-8\r\n" +
        "Set-Cookie: _gh_sess=test-only-session-value; path=/; HttpOnly\r\n" +
        `Content-Length: ${BODY.length}\r\n` +
        "\r\n" +
        BODY,
)

function permutations<T>(items: T[]): T[][] {
    if (items.length <= 1) return [items]
    return items.flatMap((item, i) =>
        permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest]),
    )
}

/** Indexes of `needle` in `hay`. */
function find(hay: Uint8Array, needle: string): Range {
    const at = Buffer.from(hay).indexOf(needle, 0, "latin1")
    if (at < 0) throw new Error(`not found: ${needle}`)
    return { start: at, end: at + needle.length }
}

const revealed = (ranges: Range[], target: Range) =>
    ranges.some(r => r.start < target.end && target.start < r.end)
const fully = (ranges: Range[], target: Range) =>
    mergeRanges(ranges).some(r => r.start <= target.start && r.end >= target.end)

/** What the bytes look like to a verifier: unrevealed bytes are hidden. */
function shown(bytes: Uint8Array, ranges: Range[]): string {
    let out = ""
    for (let i = 0; i < bytes.length; i++) {
        out += ranges.some(r => i >= r.start && i < r.end) ? String.fromCharCode(bytes[i]) : "█"
    }
    return out
}

describe("bind header", () => {
    it("names the purpose, the sender and the request hash", () => {
        expect(BIND).toBe(`demos-tlsn:v1:github:${SENDER}:${REQUEST_HASH}`)
    })

    it("lowercases the sender and writes the hash as the chain does", () => {
        const value = buildBindValue({
            purpose: "store",
            sender: SENDER.toUpperCase().replace("0X", "0x"),
            requestTxHash: "0x" + REQUEST_HASH.toUpperCase(),
        })
        expect(value).toBe(`demos-tlsn:v1:store:${SENDER}:${REQUEST_HASH}`)
    })

    it("refuses a malformed sender, hash or purpose", () => {
        const ok = { purpose: "github" as const, sender: SENDER, requestTxHash: REQUEST_HASH }
        expect(() => buildBindValue({ ...ok, sender: "11".repeat(32) })).toThrow("sender")
        expect(() => buildBindValue({ ...ok, requestTxHash: "abc" })).toThrow("hash")
        expect(() => buildBindValue({ ...ok, purpose: "twitter" as any })).toThrow("purpose")
        expect(() => buildBindValue({ ...ok, sender: `${SENDER}\r\nx: y` })).toThrow("sender")
    })

    it("replaces a caller's bind header in any case instead of sending two", () => {
        const headers = withBindHeader(
            { Accept: "application/json", "x-DEMOS-bind": "forged" },
            BIND,
        )
        expect(Object.keys(headers).filter(n => n.toLowerCase() === "x-demos-bind")).toEqual([
            TLSN_BIND_HEADER,
        ])
        expect(headers[TLSN_BIND_HEADER]).toBe(BIND)
    })
})

describe("parseHttpMessage", () => {
    it("locates the request line, each header and the end of headers", () => {
        const bytes = request(HEADERS)
        const parsed = parseHttpMessage(bytes)
        expect(parsed.startLine).toEqual({ start: 0, end: "GET /user HTTP/1.1\r\n".length })
        expect(parsed.headers.map(h => h.name)).toEqual(HEADERS.map(([n]) => n))
        const auth = parsed.headers.find(h => h.name === "authorization")!
        expect(auth.value).toEqual(find(bytes, BEARER))
        expect(parsed.headersEnd!.end).toBe(bytes.length)
        expect(parsed.body).toBeNull()
    })

    it("finds the response body", () => {
        const parsed = parseHttpMessage(RESPONSE)
        expect(parsed.body).toEqual(find(RESPONSE, BODY))
    })

    it("refuses bytes without a request line", () => {
        expect(() => parseHttpMessage(enc("GET /user"))).toThrow("start line")
    })
})

describe("default reveal ranges, every header order", () => {
    const orders = permutations(HEADERS)

    it("covers all 720 orders of six headers", () => {
        expect(orders).toHaveLength(720)
        for (const name of ["authorization", "cookie", "x-demos-bind"]) {
            const positions = new Set(orders.map(o => o.findIndex(([n]) => n === name)))
            expect(positions.size).toBe(HEADERS.length)
        }
    })

    it("reveals the request line, Host and the whole bind line, never a credential value", () => {
        for (const order of orders) {
            const sent = request(order)
            const { sent: ranges } = computeRevealRanges(sent, RESPONSE)

            expect(fully(ranges, find(sent, "GET /user HTTP/1.1\r\n"))).toBe(true)
            expect(fully(ranges, find(sent, "host: api.github.com\r\n"))).toBe(true)
            expect(fully(ranges, find(sent, `x-demos-bind: ${BIND}\r\n`))).toBe(true)
            expect(bindHeaderFullyRevealed(sent, ranges)).toBe(true)

            expect(revealed(ranges, find(sent, BEARER))).toBe(false)
            expect(revealed(ranges, find(sent, COOKIE))).toBe(false)
            // The names stay visible, so a verifier sees the header was sent.
            expect(fully(ranges, find(sent, "authorization: "))).toBe(true)
            expect(fully(ranges, find(sent, "cookie: "))).toBe(true)
        }
    })

    it("is what a node checking the bytes would accept", () => {
        // The node-side check from the spike: request line authed, bind line
        // authed with its CRLF, no Authorization value byte authed.
        for (const order of orders) {
            const sent = request(order)
            const { sent: ranges } = computeRevealRanges(sent, RESPONSE)
            const view = shown(sent, ranges).toLowerCase()
            expect(view.startsWith("get /user http/1.1\r\n")).toBe(true)
            expect(view).toContain(`\r\nx-demos-bind: ${BIND}\r\n`)
            expect(view).toContain("\r\nauthorization: █")
            expect(view).not.toContain("bearer")
            expect(view).not.toContain("session=")
        }
    })

    it("does not depend on fixed offsets", () => {
        const starts = new Set(
            orders.map(order => {
                const sent = request(order)
                return find(sent, "x-demos-bind").start
            }),
        )
        expect(starts.size).toBeGreaterThan(1)
    })

    it("shows unknown request headers by name only and keeps the request body hidden", () => {
        const sent = enc(
            "POST /v1/data HTTP/1.1\r\nhost: api.example.com\r\nx-api-key: test-only-key\r\n" +
                `x-demos-bind: ${BIND}\r\ncontent-length: 13\r\n\r\n{"secret":42}`,
        )
        const { sent: ranges } = computeRevealRanges(sent, RESPONSE)
        expect(fully(ranges, find(sent, "x-api-key: "))).toBe(true)
        expect(revealed(ranges, find(sent, "test-only-key"))).toBe(false)
        expect(revealed(ranges, find(sent, '{"secret":42}'))).toBe(false)
        expect(fully(ranges, find(sent, "content-length: 13\r\n"))).toBe(true)
    })

    it("reveals the response body for identity links, Set-Cookie by name only", () => {
        const { recv } = computeRevealRanges(request(HEADERS), RESPONSE)
        expect(fully(recv, find(RESPONSE, BODY))).toBe(true)
        expect(fully(recv, find(RESPONSE, "HTTP/1.1 200 OK\r\n"))).toBe(true)
        expect(fully(recv, find(RESPONSE, "Set-Cookie: "))).toBe(true)
        expect(revealed(recv, find(RESPONSE, "_gh_sess=test-only-session-value; path=/; HttpOnly"))).toBe(false)
    })

    it("can keep the response body hidden", () => {
        const { recv } = computeRevealRanges(request(HEADERS), RESPONSE, {
            revealResponseBody: false,
        })
        expect(revealed(recv, find(RESPONSE, BODY))).toBe(false)
    })
})

describe("interim responses", () => {
    const EARLY = "HTTP/1.1 103 Early Hints\r\nLink: </style.css>; rel=preload\r\n\r\n"
    const WITH_EARLY = enc(EARLY + Buffer.from(RESPONSE).toString("latin1"))
    const FINAL_COOKIE = "_gh_sess=test-only-session-value; path=/; HttpOnly"

    it("parses the final response after a 103", () => {
        const blocks = parseHttpResponses(WITH_EARLY)
        expect(blocks).toHaveLength(2)
        expect(blocks[0].body).toBeNull()
        expect(blocks[1].headers.map(h => h.name)).toContain("set-cookie")
        expect(blocks[1].body).toEqual(find(WITH_EARLY, BODY))
    })

    it("keeps the final Set-Cookie value hidden and reveals the final body", () => {
        const { recv } = computeRevealRanges(request(HEADERS), WITH_EARLY)
        expect(revealed(recv, find(WITH_EARLY, FINAL_COOKIE))).toBe(false)
        expect(fully(recv, find(WITH_EARLY, "Set-Cookie: "))).toBe(true)
        expect(fully(recv, find(WITH_EARLY, "HTTP/1.1 200 OK\r\n"))).toBe(true)
        expect(fully(recv, find(WITH_EARLY, BODY))).toBe(true)
    })

    it("refuses caller ranges over the final Set-Cookie value", () => {
        expect(() =>
            enforceRevealPolicy(request(HEADERS), WITH_EARLY, {
                sent: [],
                recv: [{ start: 0, end: WITH_EARLY.length }],
            }),
        ).toThrow("set-cookie")
    })

    it("reveals nothing after a 101 upgrade", () => {
        const upgraded = enc(
            "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n\r\nopaque-frames",
        )
        const { recv } = computeRevealRanges(request(HEADERS), upgraded)
        expect(revealed(recv, find(upgraded, "opaque-frames"))).toBe(false)
    })
})

describe("caller-supplied ranges", () => {
    const sent = request([
        ["host", "api.github.com"],
        ["authorization", BEARER],
        ["x-demos-bind", BIND],
        ["cookie", COOKIE],
    ])

    it("refuses a range that reveals an Authorization or Cookie value", () => {
        // The old default: a fixed 200-byte prefix.
        expect(() =>
            enforceRevealPolicy(sent, RESPONSE, {
                sent: [{ start: 0, end: 200 }],
                recv: [],
            }),
        ).toThrow("authorization")
        expect(() =>
            enforceRevealPolicy(sent, RESPONSE, {
                sent: [find(sent, COOKIE.slice(0, 5))],
                recv: [],
            }),
        ).toThrow("cookie")
    })

    it("refuses a range over a Set-Cookie value", () => {
        expect(() =>
            enforceRevealPolicy(sent, RESPONSE, {
                sent: [],
                recv: [{ start: 0, end: RESPONSE.length }],
            }),
        ).toThrow("set-cookie")
    })

    it("adds the request line, Host and the whole bind line", () => {
        const bindStart = find(sent, "x-demos-bind").start
        const commit = enforceRevealPolicy(sent, RESPONSE, {
            // Cuts the bind header in half.
            sent: [{ start: bindStart, end: bindStart + 20 }],
            recv: [find(RESPONSE, BODY)],
        })
        expect(bindHeaderFullyRevealed(sent, commit.sent)).toBe(true)
        expect(fully(commit.sent, find(sent, "GET /user HTTP/1.1\r\n"))).toBe(true)
        expect(fully(commit.sent, find(sent, "host: api.github.com\r\n"))).toBe(true)
        expect(revealed(commit.sent, find(sent, BEARER))).toBe(false)
        expect(commit.recv).toEqual([find(RESPONSE, BODY)])
    })

    it("refuses ranges outside the transcript", () => {
        expect(() =>
            enforceRevealPolicy(sent, RESPONSE, {
                sent: [{ start: 0, end: sent.length + 1 }],
                recv: [],
            }),
        ).toThrow("outside")
    })
})

describe("bindHeaderFullyRevealed", () => {
    it("is false for a missing or duplicated bind header", () => {
        const none = request([["host", "api.github.com"]])
        expect(bindHeaderFullyRevealed(none, [{ start: 0, end: none.length }])).toBe(false)
        const twice = request([
            ["x-demos-bind", BIND],
            ["X-Demos-Bind", BIND],
        ])
        expect(bindHeaderFullyRevealed(twice, [{ start: 0, end: twice.length }])).toBe(false)
    })
})
