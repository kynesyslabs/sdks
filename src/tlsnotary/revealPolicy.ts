/**
 * What a TLSNotary presentation reveals, computed from the transcript.
 *
 * tlsn-wasm builds the request headers from a HashMap, so their order (and
 * so every byte offset after the request line) changes from run to run. A
 * fixed byte prefix therefore sometimes revealed the `Authorization` value
 * and sometimes cut the `X-Demos-Bind` header in half. Ranges here come from
 * parsing the bytes that were actually sent and received.
 *
 * A presentation that is stored on chain is public, and nodes running the
 * `tlsnVerified` fork refuse one that reveals a credential value, so the rules
 * below hold for caller-supplied ranges too, not only for the defaults.
 */

import type { TLSNIdentityContext } from "@/types/abstraction"
import type { CommitRanges, Range } from "./types"

/** The request header that binds a notarised request to a Demos sender. */
export const TLSN_BIND_HEADER = "X-Demos-Bind"

/** Domain and version of the bind header value. */
export const TLSN_BIND_DOMAIN = "demos-tlsn:v1"

/** What an attestation is for: an identity context, or a stored proof. */
export type TLSNBindPurpose = TLSNIdentityContext | "store"

const BIND_PURPOSES: ReadonlySet<string> = new Set<TLSNBindPurpose>([
    "github",
    "discord",
    "telegram",
    "store",
])

/** Ties a notarised request to the account and the `tlsn_request` that paid for it. */
export interface TLSNotaryBinding {
    /** Identity context the proof will be linked under, or `"store"`. */
    purpose: TLSNBindPurpose
    /** The sender's Demos address, `0x` + 64 hex. */
    sender: string
    /** Hash of the sender's included `tlsn_request` transaction. */
    requestTxHash: string
}

/**
 * The `X-Demos-Bind` value:
 * `demos-tlsn:v1:<context|store>:<sender 0x…>:<requestTx hash>`.
 *
 * The sender is lowercase `0x` + 64 hex. The request hash is written as the
 * chain identifies transactions: 64 lowercase hex, without a prefix.
 */
export function buildBindValue(binding: TLSNotaryBinding): string {
    const { purpose } = binding
    if (!BIND_PURPOSES.has(purpose)) {
        throw new Error(
            `TLSNotary bind purpose must be one of ${[...BIND_PURPOSES].join(", ")}, got ${JSON.stringify(purpose)}`,
        )
    }
    const sender = String(binding.sender ?? "").toLowerCase()
    if (!/^0x[0-9a-f]{64}$/.test(sender)) {
        throw new Error(
            `TLSNotary bind sender must be a Demos address (0x + 64 hex), got ${JSON.stringify(binding.sender)}`,
        )
    }
    const hash = String(binding.requestTxHash ?? "")
        .toLowerCase()
        .replace(/^0x/, "")
    if (!/^[0-9a-f]{64}$/.test(hash)) {
        throw new Error(
            `TLSNotary bind request hash must be a transaction hash (64 hex), got ${JSON.stringify(binding.requestTxHash)}`,
        )
    }
    return `${TLSN_BIND_DOMAIN}:${purpose}:${sender}:${hash}`
}

/**
 * Request headers with the bind header set. Any caller-supplied header of the
 * same name, in any case, is dropped: two bind headers would leave it to the
 * verifier which one counts.
 */
export function withBindHeader(
    headers: Record<string, string>,
    bindValue: string,
): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [name, value] of Object.entries(headers)) {
        if (name.toLowerCase() !== TLSN_BIND_HEADER.toLowerCase()) {
            out[name] = value
        }
    }
    out[TLSN_BIND_HEADER] = bindValue
    return out
}

/** Request headers whose values are credentials: only the name is revealed. */
const SECRET_REQUEST_HEADERS: ReadonlySet<string> = new Set([
    "authorization",
    "proxy-authorization",
    "cookie",
])

/** Response headers whose values are credentials: only the name is revealed. */
const SECRET_RESPONSE_HEADERS: ReadonlySet<string> = new Set(["set-cookie"])

/**
 * Request headers revealed in full by default. Any other request header shows
 * its name only: a caller's `X-Api-Key` must not end up on chain because the
 * SDK did not know its name.
 */
const PUBLIC_REQUEST_HEADERS: ReadonlySet<string> = new Set([
    "host",
    TLSN_BIND_HEADER.toLowerCase(),
    "accept",
    "accept-encoding",
    "connection",
    "content-length",
    "content-type",
    "user-agent",
])

/** One header line of a parsed HTTP message. */
export interface HeaderSpan {
    /** Lowercase header name. */
    name: string
    /** The whole line, including its CRLF. */
    line: Range
    /** The name, the colon and the whitespace before the value. */
    nameEnd: number
    /** The value, without surrounding whitespace. */
    value: Range
}

/** Byte layout of one HTTP/1.x message in a transcript. */
export interface HttpMessageSpans {
    /** Request or status line, including its CRLF. */
    startLine: Range
    headers: HeaderSpan[]
    /** The empty line that ends the headers, or null if it is missing. */
    headersEnd: Range | null
    /** Everything after the headers, or null if there is none. */
    body: Range | null
}

const CR = 0x0d
const LF = 0x0a

function lineEnd(bytes: Uint8Array, from: number): number {
    for (let i = from; i + 1 < bytes.length; i++) {
        if (bytes[i] === CR && bytes[i + 1] === LF) return i + 2
    }
    return -1
}

function latin1(bytes: Uint8Array, start: number, end: number): string {
    let out = ""
    for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i])
    return out
}

/**
 * Locate the start line, each header and the body of an HTTP/1.x message.
 * Throws when there is no complete start line, since then nothing about the
 * message can be revealed safely.
 */
export function parseHttpMessage(input: Uint8Array | number[]): HttpMessageSpans {
    return parseMessageAt(input instanceof Uint8Array ? input : Uint8Array.from(input), 0)
}

function parseMessageAt(bytes: Uint8Array, offset: number): HttpMessageSpans {
    const startEnd = lineEnd(bytes, offset)
    if (startEnd < 0) {
        throw new Error("TLSNotary transcript has no complete HTTP start line")
    }
    const headers: HeaderSpan[] = []
    let at = startEnd
    let headersEnd: Range | null = null
    while (at < bytes.length) {
        const end = lineEnd(bytes, at)
        if (end < 0) break
        if (end === at + 2) {
            headersEnd = { start: at, end }
            at = end
            break
        }
        let colon = -1
        for (let i = at; i < end - 2; i++) {
            if (bytes[i] === 0x3a) {
                colon = i - at
                break
            }
        }
        if (colon <= 0) {
            throw new Error(
                `TLSNotary transcript has a malformed header line at byte ${at}`,
            )
        }
        let valueStart = at + colon + 1
        while (valueStart < end - 2 && (bytes[valueStart] === 0x20 || bytes[valueStart] === 0x09)) {
            valueStart++
        }
        let valueEnd = end - 2
        while (valueEnd > valueStart && (bytes[valueEnd - 1] === 0x20 || bytes[valueEnd - 1] === 0x09)) {
            valueEnd--
        }
        headers.push({
            name: latin1(bytes, at, at + colon).trim().toLowerCase(),
            line: { start: at, end },
            nameEnd: valueStart,
            value: { start: valueStart, end: valueEnd },
        })
        at = end
    }
    if (!headersEnd) {
        // Without the blank line the rest cannot be told apart from a header
        // that was cut off, so it is left unrevealed.
        return { startLine: { start: offset, end: startEnd }, headers, headersEnd: null, body: null }
    }
    return {
        startLine: { start: offset, end: startEnd },
        headers,
        headersEnd,
        body: at < bytes.length ? { start: at, end: bytes.length } : null,
    }
}

function statusCode(bytes: Uint8Array, line: Range): number | null {
    const match = /^HTTP\/\d(?:\.\d)? (\d{3})/.exec(latin1(bytes, line.start, line.end))
    return match ? Number(match[1]) : null
}

/**
 * Every header block of a received transcript, in order. A server may send
 * interim 1xx responses (103 Early Hints) before the final one; parsing only
 * the first block would treat the final response's headers, `Set-Cookie`
 * included, as body and reveal them. Interim blocks and a 101 upgrade carry
 * no body that may be revealed.
 */
export function parseHttpResponses(input: Uint8Array | number[]): HttpMessageSpans[] {
    const bytes = input instanceof Uint8Array ? input : Uint8Array.from(input)
    const blocks: HttpMessageSpans[] = []
    let at = 0
    for (;;) {
        const msg = parseMessageAt(bytes, at)
        blocks.push(msg)
        const code = statusCode(bytes, msg.startLine)
        if (code === null || code < 100 || code > 199) return blocks
        msg.body = null
        if (code === 101 || !msg.headersEnd || msg.headersEnd.end >= bytes.length) {
            return blocks
        }
        at = msg.headersEnd.end
    }
}

/** Sort and merge ranges; empty ranges are dropped. */
export function mergeRanges(ranges: Range[]): Range[] {
    const sorted = ranges
        .filter(r => r.end > r.start)
        .map(r => ({ start: r.start, end: r.end }))
        .sort((a, b) => a.start - b.start)
    const out: Range[] = []
    for (const r of sorted) {
        const last = out[out.length - 1]
        if (last && r.start <= last.end) {
            last.end = Math.max(last.end, r.end)
        } else {
            out.push(r)
        }
    }
    return out
}

/** The parts of a header line that show everything but its value. */
function nameOnly(h: HeaderSpan): Range[] {
    return [
        { start: h.line.start, end: h.nameEnd },
        { start: h.value.end, end: h.line.end },
    ]
}

function overlaps(ranges: Range[], target: Range): boolean {
    return ranges.some(r => r.start < target.end && target.start < r.end)
}

function covers(ranges: Range[], target: Range): boolean {
    return mergeRanges(ranges).some(
        r => r.start <= target.start && r.end >= target.end,
    )
}

/** Byte ranges that must be revealed for the node to check the request. */
export function mandatorySentRanges(sent: Uint8Array | number[]): Range[] {
    const req = parseHttpMessage(sent)
    const out: Range[] = [req.startLine]
    for (const h of req.headers) {
        if (h.name === "host" || h.name === TLSN_BIND_HEADER.toLowerCase()) {
            out.push(h.line)
        }
    }
    return out
}

/** Options for {@link computeRevealRanges}. */
export interface RevealPolicyOptions {
    /** Reveal the response body (default true; identity links need it). */
    revealResponseBody?: boolean
}

/**
 * Default reveal ranges for a transcript.
 *
 * Sent: the request line, `Host` and the whole `X-Demos-Bind` line; a few
 * structural headers in full; every other header by name only, and
 * `Authorization`/`Cookie` by name only always. The request body stays hidden.
 *
 * Received: the status line and the headers of every response block,
 * interim 1xx ones included (`Set-Cookie` by name only), and the final
 * body unless `revealResponseBody` is false. Identity links need the
 * JSON body, from which the node reads the account.
 */
export function computeRevealRanges(
    sent: Uint8Array | number[],
    recv: Uint8Array | number[],
    options: RevealPolicyOptions = {},
): CommitRanges {
    const req = parseHttpMessage(sent)
    const sentRanges: Range[] = [req.startLine]
    for (const h of req.headers) {
        if (!SECRET_REQUEST_HEADERS.has(h.name) && PUBLIC_REQUEST_HEADERS.has(h.name)) {
            sentRanges.push(h.line)
        } else {
            sentRanges.push(...nameOnly(h))
        }
    }
    if (req.headersEnd) sentRanges.push(req.headersEnd)

    const recvBytes = recv instanceof Uint8Array ? recv : Uint8Array.from(recv)
    const recvRanges: Range[] = []
    if (recvBytes.length > 0) {
        for (const res of parseHttpResponses(recvBytes)) {
            recvRanges.push(res.startLine)
            for (const h of res.headers) {
                if (SECRET_RESPONSE_HEADERS.has(h.name)) {
                    recvRanges.push(...nameOnly(h))
                } else {
                    recvRanges.push(h.line)
                }
            }
            if (res.headersEnd) recvRanges.push(res.headersEnd)
            if (res.body && options.revealResponseBody !== false) {
                recvRanges.push(res.body)
            }
        }
    }

    return { sent: mergeRanges(sentRanges), recv: mergeRanges(recvRanges) }
}

function checkBounds(ranges: Range[], length: number, side: string) {
    for (const r of ranges) {
        if (
            !Number.isInteger(r.start) ||
            !Number.isInteger(r.end) ||
            r.start < 0 ||
            r.end > length ||
            r.start > r.end
        ) {
            throw new Error(
                `TLSNotary ${side} range ${JSON.stringify(r)} is outside the ${length}-byte transcript`,
            )
        }
    }
}

/**
 * Apply the reveal rules to caller-supplied ranges: add what the node must
 * see (request line, `Host`, the bind header) and refuse any range that
 * touches a credential value. Throwing here, before notarisation, means the
 * caller has spent nothing but the request fee.
 */
export function enforceRevealPolicy(
    sent: Uint8Array | number[],
    recv: Uint8Array | number[],
    commit: CommitRanges,
): CommitRanges {
    const sentBytes = sent instanceof Uint8Array ? sent : Uint8Array.from(sent)
    const recvBytes = recv instanceof Uint8Array ? recv : Uint8Array.from(recv)
    checkBounds(commit.sent, sentBytes.length, "sent")
    checkBounds(commit.recv, recvBytes.length, "recv")

    const req = parseHttpMessage(sentBytes)
    for (const h of req.headers) {
        if (SECRET_REQUEST_HEADERS.has(h.name) && overlaps(commit.sent, h.value)) {
            throw new Error(
                `TLSNotary reveal ranges expose the value of the ${h.name} request header; reveal its name only`,
            )
        }
    }
    if (recvBytes.length > 0) {
        const headers = parseHttpResponses(recvBytes).flatMap(res => res.headers)
        for (const h of headers) {
            if (SECRET_RESPONSE_HEADERS.has(h.name) && overlaps(commit.recv, h.value)) {
                throw new Error(
                    `TLSNotary reveal ranges expose the value of the ${h.name} response header; reveal its name only`,
                )
            }
        }
    }

    return {
        sent: mergeRanges([...commit.sent, ...mandatorySentRanges(sentBytes)]),
        recv: mergeRanges(commit.recv),
    }
}

/**
 * Whether the bind header line is revealed in full, CRLF included. Exposed
 * so callers and tests can check a commit the same way a node does.
 */
export function bindHeaderFullyRevealed(
    sent: Uint8Array | number[],
    ranges: Range[],
): boolean {
    const req = parseHttpMessage(sent)
    const bind = req.headers.filter(h => h.name === TLSN_BIND_HEADER.toLowerCase())
    return bind.length === 1 && covers(ranges, bind[0].line)
}
