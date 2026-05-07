import { describe, test, expect } from "@jest/globals"

import { serializeTransactionContent } from "./serializerGate"
import type { TransactionContent } from "@/types/blockchain/Transaction"
import type { GCREdit } from "@/types/blockchain/GCREdit"

// REVIEW: P4 commit 2 — load-bearing wire boundary. Tests assert byte
// identity for the pre-fork branch (must equal legacy `JSON.stringify`)
// and the canonical post-fork shape (`amount`, `transaction_fee.*`, and
// targeted `gcr_edits[].amount` carriers as OS strings; key order
// preserved).

/**
 * Build a `TransactionContent` fixture in the canonical key order, with
 * a mix of `gcr_edits` entries to exercise the per-variant transformer.
 */
function buildFixture(): TransactionContent {
    const gcr_edits: GCREdit[] = [
        {
            type: "balance",
            isRollback: false,
            operation: "remove",
            account: "0xsender",
            amount: 100, // legacy DEM number
            txhash: "",
        },
        {
            type: "nonce",
            isRollback: false,
            operation: "add",
            account: "0xsender",
            amount: 1,
            txhash: "",
        },
        {
            type: "balance",
            isRollback: false,
            operation: "add",
            account: "0xreceiver",
            amount: 100,
            txhash: "",
        },
        {
            type: "escrow",
            operation: "deposit",
            account: "0xescrow",
            data: {
                sender: "0xsender",
                platform: "twitter",
                username: "@bob",
                amount: 100, // legacy DEM number — should become OS string post-fork
                expiryDays: 30,
            },
            txhash: "",
            isRollback: false,
        },
    ]

    const content: TransactionContent = {
        type: "native",
        from: "0xsender",
        to: "0xreceiver",
        amount: 100, // legacy DEM
        data: [
            "native",
            {
                nativeOperation: "send",
                args: ["0xreceiver", 100],
            },
        ] as TransactionContent["data"],
        nonce: 1,
        timestamp: 1_700_000_000_000,
        transaction_fee: {
            network_fee: 1,
            rpc_fee: 0,
            additional_fee: 0,
        },
        from_ed25519_address: "0xsender",
        gcr_edits,
    }
    return content
}

describe("serializerGate — pre-fork branch", () => {
    test("output is byte-identical to legacy JSON.stringify for current SDK content", () => {
        const content = buildFixture()
        const expected = JSON.stringify(content)
        expect(serializeTransactionContent(content, false)).toBe(expected)
    })

    test("normalises stray bigint amount back to legacy DEM number", () => {
        const content = buildFixture()
        // Simulate an internal bigint OS amount leaking into content.
        // 100 DEM = 100_000_000_000n OS.
        content.amount = 100_000_000_000n as unknown as number
        const out = serializeTransactionContent(content, false)
        const parsed = JSON.parse(out)
        expect(parsed.amount).toBe(100)
    })

    test("normalises stray OS-string amount back to DEM number", () => {
        const content = buildFixture()
        content.amount = "100000000000" as unknown as number
        const out = serializeTransactionContent(content, false)
        const parsed = JSON.parse(out)
        expect(parsed.amount).toBe(100)
    })

    test("normalises bigint balance edit back to DEM number", () => {
        const content = buildFixture()
        ;(content.gcr_edits[0] as any).amount = 100_000_000_000n
        const out = serializeTransactionContent(content, false)
        const parsed = JSON.parse(out)
        expect(parsed.gcr_edits[0].amount).toBe(100)
    })
})

describe("serializerGate — post-fork branch", () => {
    test("amount becomes OS string", () => {
        const content = buildFixture()
        const out = serializeTransactionContent(content, true)
        const parsed = JSON.parse(out)
        expect(parsed.amount).toBe("100000000000")
    })

    test("transaction_fee fields all become OS strings", () => {
        const content = buildFixture()
        const out = serializeTransactionContent(content, true)
        const parsed = JSON.parse(out)
        expect(parsed.transaction_fee.network_fee).toBe("1000000000")
        expect(parsed.transaction_fee.rpc_fee).toBe("0")
        expect(parsed.transaction_fee.additional_fee).toBe("0")
    })

    test("gcr_edits balance amounts become OS strings; nonce stays a number", () => {
        const content = buildFixture()
        const out = serializeTransactionContent(content, true)
        const parsed = JSON.parse(out)
        expect(parsed.gcr_edits[0].amount).toBe("100000000000")
        expect(parsed.gcr_edits[1].amount).toBe(1) // nonce — counter, untouched
        expect(parsed.gcr_edits[2].amount).toBe("100000000000")
    })

    test("escrow nested amount becomes OS string", () => {
        const content = buildFixture()
        const out = serializeTransactionContent(content, true)
        const parsed = JSON.parse(out)
        expect(parsed.gcr_edits[3].data.amount).toBe("100000000000")
    })

    test("post-fork output preserves canonical top-level key order", () => {
        const content = buildFixture()
        const out = serializeTransactionContent(content, true)
        const parsed = JSON.parse(out)
        // Canonical order from SPEC_P4 §3.5.
        expect(Object.keys(parsed)).toEqual([
            "type",
            "from",
            "to",
            "amount",
            "data",
            "nonce",
            "timestamp",
            "transaction_fee",
            "from_ed25519_address",
            "gcr_edits",
        ])
    })

    test("post-fork output preserves transaction_fee key order", () => {
        const content = buildFixture()
        const out = serializeTransactionContent(content, true)
        const parsed = JSON.parse(out)
        expect(Object.keys(parsed.transaction_fee)).toEqual([
            "network_fee",
            "rpc_fee",
            "additional_fee",
        ])
    })

    test("non-canonical OS string is normalised", () => {
        const content = buildFixture()
        // "00100" must become "100" after re-emit.
        content.amount = "00100" as unknown as number
        const out = serializeTransactionContent(content, true)
        const parsed = JSON.parse(out)
        expect(parsed.amount).toBe("100")
    })

    test("bigint amount round-trips through the wire", () => {
        const content = buildFixture()
        content.amount = 1_500_000_000n as unknown as number
        const out = serializeTransactionContent(content, true)
        const parsed = JSON.parse(out)
        expect(parsed.amount).toBe("1500000000")
    })

    test("sub-DEM precision preserved via OS string", () => {
        const content = buildFixture()
        // 0.000000001 DEM = 1n OS.
        content.amount = 1n as unknown as number
        const out = serializeTransactionContent(content, true)
        const parsed = JSON.parse(out)
        expect(parsed.amount).toBe("1")
    })
})

describe("serializerGate — input invariance", () => {
    test("does not mutate the input content object", () => {
        const content = buildFixture()
        const before = JSON.stringify(content)
        serializeTransactionContent(content, true)
        expect(JSON.stringify(content)).toBe(before)
    })
})

describe("serializerGate — transaction_fee key order (myc#19)", () => {
    test("post-fork preserves non-canonical fee insertion order", () => {
        const content = buildFixture()
        // Construct fee with `additional_fee` first to break the old
        // hard-coded literal order.
        content.transaction_fee = {
            additional_fee: 0,
            rpc_fee: 0,
            network_fee: 1,
        } as any
        const out = serializeTransactionContent(content, true)
        const parsed = JSON.parse(out)
        expect(Object.keys(parsed.transaction_fee)).toEqual([
            "additional_fee",
            "rpc_fee",
            "network_fee",
        ])
    })

    test("pre-fork preserves non-canonical fee insertion order", () => {
        const content = buildFixture()
        content.transaction_fee = {
            additional_fee: 0,
            rpc_fee: 0,
            network_fee: 1,
        } as any
        const out = serializeTransactionContent(content, false)
        const parsed = JSON.parse(out)
        expect(Object.keys(parsed.transaction_fee)).toEqual([
            "additional_fee",
            "rpc_fee",
            "network_fee",
        ])
    })

    test("post-fork passes through unknown extra fee fields verbatim", () => {
        const content = buildFixture()
        content.transaction_fee = {
            network_fee: 1,
            rpc_fee: 0,
            additional_fee: 0,
            // Future extension field the SDK doesn't know about — must
            // not be dropped (consensus would diverge if the node knows
            // it and we strip it).
            future_field: "abc",
        } as any
        const out = serializeTransactionContent(content, true)
        const parsed = JSON.parse(out)
        expect(parsed.transaction_fee.future_field).toBe("abc")
    })
})
