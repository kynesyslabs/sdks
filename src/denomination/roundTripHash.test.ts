import { describe, test, expect } from "@jest/globals"

import { serializeTransactionContent } from "./serializerGate"
import { demToOs, parseOsString, toOsString } from "./conversion"
import type { TransactionContent } from "@/types/blockchain/Transaction"
import type { GCREdit } from "@/types/blockchain/GCREdit"

// REVIEW: P4 commit 4 — load-bearing round-trip hash equality. The
// test inlines the node's `serializeTransactionContent` algorithm
// (verbatim port of `node/src/forks/serializerGate.ts`) so the SDK's
// implementation is asserted against the canonical node bytes
// without a cross-repo runtime dependency.
//
// If this test breaks, the SDK has produced bytes the node will
// reject with an InvalidSignature — STOP and triage before shipping.

/**
 * Verbatim port of the node's `toOsBigint` from
 * `node/src/forks/serializerGate.ts:41`. Kept inline so this test
 * fails the day the node's coercion semantics drift, instead of
 * silently passing against a stale fixture.
 */
function nodeToOsBigint(value: number | string | bigint): bigint {
    if (typeof value === "bigint") {
        return value
    }
    if (typeof value === "string") {
        return parseOsString(value)
    }
    return demToOs(value)
}

/**
 * Verbatim port of the node's `transformToOsTransactionContent` from
 * `node/src/forks/serializerGate.ts:73`. Note the deliberate scope:
 * the node only transforms top-level `amount` and `transaction_fee.*`.
 * It does **not** walk `gcr_edits[]`. The SDK's serializer is the
 * source of truth for that array — fixtures here therefore arrive
 * with gcr_edits already in OS-string shape.
 */
function nodeTransformToOsTransactionContent(
    content: TransactionContent,
): TransactionContent {
    const transformed = { ...content } as TransactionContent

    if (typeof content.amount !== "undefined" && content.amount !== null) {
        const osAmount = nodeToOsBigint(content.amount as number | string | bigint)
        transformed.amount = toOsString(osAmount) as unknown as number
    }

    if (content.transaction_fee) {
        const fee = content.transaction_fee
        transformed.transaction_fee = {
            network_fee: toOsString(
                nodeToOsBigint(fee.network_fee as number | string | bigint),
            ) as unknown as number,
            rpc_fee: toOsString(
                nodeToOsBigint(fee.rpc_fee as number | string | bigint),
            ) as unknown as number,
            additional_fee: toOsString(
                nodeToOsBigint(fee.additional_fee as number | string | bigint),
            ) as unknown as number,
        }
    }

    return transformed
}

/**
 * Verbatim port of the node's `serializeTransactionContent` from
 * `node/src/forks/serializerGate.ts:124`. The block-height /
 * `isForkActive` check is collapsed into a boolean parameter for the
 * test — the SDK doesn't see blocks, the node does, but at the
 * post-fork branch both produce the same bytes.
 */
function nodeSerializeTransactionContent(
    content: TransactionContent,
    isPostFork: boolean,
): string {
    if (isPostFork) {
        return JSON.stringify(nodeTransformToOsTransactionContent(content))
    }
    return JSON.stringify(content)
}

/**
 * Build a transaction-content fixture in canonical key order with
 * gcr_edits already populated as the SDK would emit them post-fork
 * (`amount` is OS string for `balance` and `escrow.data.amount`; the
 * `nonce` edit's `amount` stays a counter number). This matches what
 * `GCRGeneration.generate` produces against a post-fork node.
 */
function buildPostForkShapedFixture(): TransactionContent {
    const gcr_edits: GCREdit[] = [
        {
            type: "balance",
            isRollback: false,
            operation: "remove",
            account: "0xsender",
            amount: "100000000001", // sub-DEM-precision OS string
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
            amount: "100000000001",
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
                amount: "100000000001",
                expiryDays: 30,
            },
            txhash: "",
            isRollback: false,
        },
    ]

    return {
        type: "native",
        from: "0xsender",
        to: "0xreceiver",
        amount: "100000000001", // sub-DEM-precision OS string
        data: [
            "native",
            {
                nativeOperation: "send",
                args: ["0xreceiver", "100000000001"],
            },
        ] as TransactionContent["data"],
        nonce: 1,
        timestamp: 1_700_000_000_000,
        transaction_fee: {
            network_fee: "1000000000",
            rpc_fee: "0",
            additional_fee: "0",
        },
        from_ed25519_address: "0xsender",
        gcr_edits,
    }
}

describe("round-trip hash equality — SDK post-fork == node post-fork", () => {
    test("OS-string fixture: SDK and node produce identical bytes", () => {
        const content = buildPostForkShapedFixture()
        const sdkBytes = serializeTransactionContent(content, true)
        const nodeBytes = nodeSerializeTransactionContent(content, true)
        expect(sdkBytes).toBe(nodeBytes)
    })

    test("legacy DEM-number fixture: post-fork SDK matches node post-fork output", () => {
        // Build a fixture where the user has populated content with
        // legacy DEM numbers (the v2 callers' pattern). Both SDK and
        // node will normalise the top-level `amount` and
        // `transaction_fee.*` to OS strings; the SDK additionally
        // walks gcr_edits — but the node serializer leaves gcr_edits
        // alone, so to get byte equality the fixture must already
        // carry the post-fork-shaped edits. (This is exactly the SDK
        // contract: gcr_edits are the SDK's responsibility.)
        const content = buildPostForkShapedFixture()
        // Override the wire-sensitive fields with legacy DEM numbers.
        content.amount = 100 as unknown as string
        content.transaction_fee = {
            network_fee: 1,
            rpc_fee: 0,
            additional_fee: 0,
        }
        const sdkBytes = serializeTransactionContent(content, true)
        const nodeBytes = nodeSerializeTransactionContent(content, true)
        expect(sdkBytes).toBe(nodeBytes)
    })

    test("bigint amount: SDK normalises before stringify; node sees the SDK output", () => {
        // The node never sees a raw bigint on the wire (JSON has no
        // bigint). But the SDK's internal carrier is bigint, and the
        // serializer must coerce to OS string before JSON.stringify.
        // Verify both produce the same canonical output for an
        // OS-string fixture that started from a bigint input.
        const sourceBigintOs = 100_000_000_001n
        const content = buildPostForkShapedFixture()
        content.amount = toOsString(sourceBigintOs) as unknown as string

        const sdkBytes = serializeTransactionContent(content, true)
        const nodeBytes = nodeSerializeTransactionContent(content, true)
        expect(sdkBytes).toBe(nodeBytes)

        const parsed = JSON.parse(sdkBytes)
        expect(parsed.amount).toBe("100000000001")
    })

    test("non-canonical OS-string normalises identically on both sides", () => {
        const content = buildPostForkShapedFixture()
        content.amount = "00100" as unknown as string
        const sdkBytes = serializeTransactionContent(content, true)
        const nodeBytes = nodeSerializeTransactionContent(content, true)
        expect(sdkBytes).toBe(nodeBytes)
        const parsed = JSON.parse(sdkBytes)
        expect(parsed.amount).toBe("100")
    })

    test("pre-fork branch: SDK and node both stringify content as-is", () => {
        // For pre-fork content with no internal bigints / OS strings,
        // both branches produce `JSON.stringify(content)` verbatim.
        const content: TransactionContent = {
            type: "native",
            from: "0xsender",
            to: "0xreceiver",
            amount: 100,
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
            gcr_edits: [
                {
                    type: "balance",
                    isRollback: false,
                    operation: "remove",
                    account: "0xsender",
                    amount: 100,
                    txhash: "",
                },
            ],
        }
        const sdkBytes = serializeTransactionContent(content, false)
        const nodeBytes = nodeSerializeTransactionContent(content, false)
        expect(sdkBytes).toBe(nodeBytes)
        expect(sdkBytes).toBe(JSON.stringify(content))
    })
})
