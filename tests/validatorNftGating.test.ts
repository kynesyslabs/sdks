import { describe, test, expect } from "@jest/globals"
import { GCRGeneration } from "@/websdk/GCRGeneration"
import type { Transaction } from "@/types/blockchain/Transaction"
import type { GCREditValidatorStake } from "@/types/blockchain/GCREdit"

// Edit generation for the NFT-gated staking transactions. `generate()`
// also appends a nonce edit, so each test picks out the validatorStake
// edits before asserting on them.

const SENDER = "0x" + "a".repeat(64)
const OTHER = "0x" + "b".repeat(64)
const MINT = "7M7TxyCHoX3jmUNh68QxWWnUSbxJwEUTJoN5dHxTctGH"
const OWNER = "2edqWDWbFkTjkcTb4zzj3PwQBHJeXbFuiAynm4bj46yP"
const SIG =
    "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW"

function makeTx(type: string, payload: unknown): Transaction {
    return {
        content: {
            type,
            from: SENDER,
            to: SENDER,
            from_ed25519_address: SENDER,
            amount: 0,
            data: [type, payload],
            gcr_edits: [],
            nonce: 1,
            timestamp: 1_700_000_000_000,
            transaction_fee: {
                network_fee: "0",
                rpc_fee: "0",
                additional_fee: "0",
                rpc_address: null,
            },
        },
        hash: "deadbeef".repeat(8),
        signature: null,
        ed25519_signature: null,
        status: null,
        blockNumber: null,
    } as unknown as Transaction
}

async function stakeEdits(tx: Transaction): Promise<GCREditValidatorStake[]> {
    const edits = await GCRGeneration.generate(tx)
    return edits.filter(
        (e): e is GCREditValidatorStake => e.type === "validatorStake",
    )
}

describe("validatorStake edit generation with an NFT proof", () => {
    test("carries the proof through to the edit", async () => {
        const edits = await stakeEdits(
            makeTx("validatorStake", {
                amount: "1000",
                connectionUrl: "https://v1.example",
                nft: { mint: MINT, owner: OWNER, proofTx: SIG },
            }),
        )
        expect(edits).toHaveLength(1)
        expect(edits[0]).toMatchObject({
            account: SENDER,
            operation: "stake",
            amount: "1000",
            connectionUrl: "https://v1.example",
            nft: { mint: MINT, owner: OWNER, proofTx: SIG },
        })
    })

    test("a stake without nft is unchanged from before", async () => {
        const edits = await stakeEdits(
            makeTx("validatorStake", {
                amount: "1000",
                connectionUrl: "https://v1.example",
            }),
        )
        expect(edits).toHaveLength(1)
        expect(edits[0]).not.toHaveProperty("nft")
        expect(edits[0]).toMatchObject({ operation: "stake", amount: "1000" })
    })

    test.each([
        ["mint", { mint: "not base58 0OIl", owner: OWNER, proofTx: SIG }],
        ["owner", { mint: MINT, owner: "", proofTx: SIG }],
        ["proofTx", { mint: MINT, owner: OWNER, proofTx: 12345 }],
    ])("rejects a malformed nft.%s", async (field, nft) => {
        await expect(
            stakeEdits(
                makeTx("validatorStake", {
                    amount: "1000",
                    connectionUrl: "https://v1.example",
                    nft,
                }),
            ),
        ).rejects.toThrow(`nft.${field}`)
    })

    test("rejects an nft that is not an object", async () => {
        await expect(
            stakeEdits(
                makeTx("validatorStake", {
                    amount: "1000",
                    connectionUrl: "https://v1.example",
                    nft: SIG,
                }),
            ),
        ).rejects.toThrow("nft must be an object")
    })
})

describe("validatorChallenge edit generation", () => {
    test("produces an evict edit against the challenged validator", async () => {
        const edits = await stakeEdits(
            makeTx("validatorChallenge", { validator: OTHER, evidenceTx: SIG, proofTx: SIG }),
        )
        expect(edits).toHaveLength(1)
        expect(edits[0]).toEqual({
            type: "validatorStake",
            isRollback: false,
            account: OTHER,
            operation: "evict",
            amount: "0",
            evidenceTx: SIG,
            proofTx: SIG,
            txhash: "deadbeef".repeat(8),
        })
    })

    test("rejects a validator that is not an ed25519 address", async () => {
        await expect(
            stakeEdits(
                makeTx("validatorChallenge", { validator: "0x1234", evidenceTx: SIG, proofTx: SIG }),
            ),
        ).rejects.toThrow("validator must be an ed25519 address")
    })

    test("rejects an evidenceTx or proofTx that is not a base58 signature", async () => {
        await expect(
            stakeEdits(
                makeTx("validatorChallenge", { validator: OTHER, evidenceTx: "0xabc", proofTx: SIG }),
            ),
        ).rejects.toThrow("evidenceTx must be a base58 signature")
        await expect(
            stakeEdits(
                makeTx("validatorChallenge", { validator: OTHER, evidenceTx: SIG, proofTx: "0xabc" }),
            ),
        ).rejects.toThrow("proofTx must be a base58 signature")
    })
})
