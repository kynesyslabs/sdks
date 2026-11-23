import { Demos, DemosTransactions } from "@/websdk"
import { GCRGeneration } from "@/websdk/GCRGeneration"
import type { GCREdit, GCREditValidatorStake } from "@/types/blockchain/GCREdit"
import type { Transaction } from "@/types/blockchain/Transaction"
import { serializeTransactionContent } from "@/denomination/serializerGate"

// The node regenerates the edits of every signed transaction and refuses the
// transaction when they differ (editBinding). These tests pin the edits the
// SDK signs for seat transactions on both sides of `nftValidatorGating`.

const SENDER = "0x" + "a".repeat(64)
const OTHER = "0x" + "b".repeat(64)
const MINT = "7M7TxyCHoX3jmUNh68QxWWnUSbxJwEUTJoN5dHxTctGH"
const OWNER = "2edqWDWbFkTjkcTb4zzj3PwQBHJeXbFuiAynm4bj46yP"
const SIG =
    "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW"
const EVIDENCE =
    "3bC9dVxyQ3LkAkrGqq9n2jpEr7fH5bV8GsMcZf8xmRJ1oN4Wp6tYbHgS2uKvLdE7aFhXzQ9cPwR5mTn1yUiBoKjD"
const NFT = { mint: MINT, owner: OWNER, proofTx: SIG }
const GATED = { nftValidatorGating: true }

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

function stakeEditsOf(edits: GCREdit[]): GCREditValidatorStake[] {
    return edits.filter(
        (e): e is GCREditValidatorStake => e.type === "validatorStake",
    )
}

const shape = (edits: GCREdit[]) =>
    edits.map(e => e.type + ((e as any).operation ? ":" + (e as any).operation : ""))

// --- Copies of the node's comparison, so the SDK can be checked against it
// without importing node code. Sources (node, port/nft-validator-gating):
//   canonical            src/libs/blockchain/validation/verifyGcrEdits.ts:60
//   trailingDebitIndex   src/libs/blockchain/validation/legacyGas.ts:112
//   nftGatedSeatEdits    src/libs/blockchain/validation/generateGcrEdits.ts:123
//   blankTxhash          src/libs/blockchain/validation/editBinding.ts:103
//   toWireShape          src/libs/blockchain/validation/editBinding.ts:113

function canonical(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(v => canonical(v === undefined ? null : v)).join(",")}]`
    }
    if (value !== null && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        return `{${entries
            .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
            .join(",")}}`
    }
    return JSON.stringify(value) ?? "null"
}

function withoutLegacyGas(edits: any[]): any[] {
    const last = edits.length - 1
    if (last < 1) return edits
    const nonce = edits[last]
    const debit = edits[last - 1]
    if (nonce.type !== "nonce" || debit.type !== "balance") return edits
    if (debit.operation !== "remove" || debit.account !== nonce.account) return edits
    return [...edits.slice(0, last - 1), ...edits.slice(last)]
}

/**
 * What a node under the fork regenerates for a seat tx. The node runs the
 * SDK generator without fork options (a released SDK knows nothing of the
 * fork) and derives the gating rules on top of that output.
 */
async function nodeRegenerated(tx: Transaction): Promise<any[]> {
    const type = tx.content.type as string
    const edits = withoutLegacyGas(await GCRGeneration.generate(tx))
    const payload = (tx.content.data as any)[1]
    if (type === "validatorStake") {
        const nft = payload.nft
        if (nft === undefined) return edits
        return edits.map(e =>
            e.type !== "validatorStake" || e.operation !== "stake" || e.nft !== undefined
                ? e
                : { ...e, nft: { mint: nft.mint, owner: nft.owner, proofTx: nft.proofTx } },
        )
    }
    if (type === "validatorChallenge") {
        if (edits.some(e => e.operation === "evict")) return edits
        const evict = {
            type: "validatorStake",
            isRollback: false,
            account: payload.validator.startsWith("0x")
                ? payload.validator
                : `0x${payload.validator}`,
            operation: "evict",
            amount: "0",
            evidenceTx: payload.evidenceTx,
            proofTx: payload.proofTx,
            txhash: tx.hash,
        }
        return [evict, ...edits]
    }
    return edits
}

const blankTxhash = (edits: any[]) => edits.map(e => ({ ...e, txhash: "" }))

/** The node brings its regenerated edits to the signed wire shape (OS strings post-osDenomination). */
function toWireShape(edits: any[], postFork: boolean): any[] {
    const serialised = serializeTransactionContent({ gcr_edits: edits } as never, postFork)
    return (JSON.parse(serialised) as { gcr_edits?: any[] }).gcr_edits ?? []
}

/** editBinding's verdict: shipped edits equal the regenerated ones in wire shape. */
function sameAsNode(shipped: unknown[], regenerated: unknown[]): boolean {
    return (
        canonical(blankTxhash(JSON.parse(JSON.stringify(shipped)))) ===
        canonical(toWireShape(blankTxhash(regenerated as any[]), true))
    )
}

// --- Edit generation

describe("validatorStake edit generation under nftValidatorGating", () => {
    test("carries the proof through to the edit and ships no gas", async () => {
        const edits = await GCRGeneration.generate(
            makeTx("validatorStake", {
                amount: "0",
                connectionUrl: "https://v1.example",
                nft: NFT,
            }),
            false,
            GATED,
        )
        expect(shape(edits)).toEqual(["validatorStake:stake", "nonce:add"])
        expect(stakeEditsOf(edits)[0]).toMatchObject({
            account: SENDER,
            operation: "stake",
            amount: "0",
            connectionUrl: "https://v1.example",
            nft: NFT,
        })
    })

    test("a stake without nft carries no nft field", async () => {
        const edits = await GCRGeneration.generate(
            makeTx("validatorStake", { amount: "0", connectionUrl: "https://v1.example" }),
            false,
            GATED,
        )
        expect(stakeEditsOf(edits)).toHaveLength(1)
        expect(stakeEditsOf(edits)[0]).not.toHaveProperty("nft")
    })

    test.each([
        ["mint", { mint: "not base58 0OIl", owner: OWNER, proofTx: SIG }],
        ["owner", { mint: MINT, owner: "", proofTx: SIG }],
        ["proofTx", { mint: MINT, owner: OWNER, proofTx: 12345 }],
    ])("rejects a malformed nft.%s", async (field, nft) => {
        await expect(
            GCRGeneration.generate(
                makeTx("validatorStake", {
                    amount: "0",
                    connectionUrl: "https://v1.example",
                    nft,
                }),
                false,
                GATED,
            ),
        ).rejects.toThrow(`nft.${field}`)
    })

    test("rejects an nft that is not an object", async () => {
        await expect(
            GCRGeneration.generate(
                makeTx("validatorStake", {
                    amount: "0",
                    connectionUrl: "https://v1.example",
                    nft: SIG,
                }),
                false,
                GATED,
            ),
        ).rejects.toThrow("nft must be an object")
    })

    test("unstake and exit ship no gas", async () => {
        for (const type of ["validatorUnstake", "validatorExit"]) {
            const edits = await GCRGeneration.generate(makeTx(type, {}), false, GATED)
            expect(shape(edits)).toEqual([
                `validatorStake:${type === "validatorExit" ? "exit" : "unstake"}`,
                "nonce:add",
            ])
        }
    })
})

describe("validatorChallenge edit generation under nftValidatorGating", () => {
    test("produces an evict edit against the challenged validator", async () => {
        const edits = await GCRGeneration.generate(
            makeTx("validatorChallenge", { validator: OTHER, evidenceTx: EVIDENCE, proofTx: SIG }),
            false,
            GATED,
        )
        expect(shape(edits)).toEqual(["validatorStake:evict", "nonce:add"])
        expect(edits[0]).toEqual({
            type: "validatorStake",
            isRollback: false,
            account: OTHER,
            operation: "evict",
            amount: "0",
            evidenceTx: EVIDENCE,
            proofTx: SIG,
            txhash: "deadbeef".repeat(8),
        })
    })

    test("rejects a validator that is not an ed25519 address", async () => {
        await expect(
            GCRGeneration.generate(
                makeTx("validatorChallenge", { validator: "0x1234", evidenceTx: EVIDENCE, proofTx: SIG }),
                false,
                GATED,
            ),
        ).rejects.toThrow("validator must be an ed25519 address")
    })

    test("rejects an evidenceTx or proofTx that is not a base58 signature", async () => {
        await expect(
            GCRGeneration.generate(
                makeTx("validatorChallenge", { validator: OTHER, evidenceTx: "0xabc", proofTx: SIG }),
                false,
                GATED,
            ),
        ).rejects.toThrow("evidenceTx must be a base58 signature")
        await expect(
            GCRGeneration.generate(
                makeTx("validatorChallenge", { validator: OTHER, evidenceTx: EVIDENCE, proofTx: "0xabc" }),
                false,
                GATED,
            ),
        ).rejects.toThrow("proofTx must be a base58 signature")
    })
})

describe("edit generation without the fork is unchanged", () => {
    test("seat txs keep their gas edit", async () => {
        const stake = await GCRGeneration.generate(
            makeTx("validatorStake", { amount: "1000", connectionUrl: "https://v1.example" }),
        )
        expect(shape(stake)).toEqual(["validatorStake:stake", "balance:remove", "nonce:add"])
        for (const type of ["validatorUnstake", "validatorExit"]) {
            const edits = await GCRGeneration.generate(makeTx(type, {}))
            expect(shape(edits)[1]).toBe("balance:remove")
        }
    })

    test("an nft in the payload does not reach the edit", async () => {
        const edits = await GCRGeneration.generate(
            makeTx("validatorStake", {
                amount: "1000",
                connectionUrl: "https://v1.example",
                nft: NFT,
            }),
        )
        expect(stakeEditsOf(edits)[0]).not.toHaveProperty("nft")
    })

    test("a validatorChallenge gets only the universal edits", async () => {
        const edits = await GCRGeneration.generate(
            makeTx("validatorChallenge", { validator: OTHER, evidenceTx: EVIDENCE, proofTx: SIG }),
        )
        expect(shape(edits)).toEqual(["balance:remove", "nonce:add"])
    })

    test("a native tx is unaffected by the option", async () => {
        const native = makeTx("native", { nativeOperation: "send", args: [OTHER, 1] })
        const withOption = await GCRGeneration.generate(native, false, GATED)
        const without = await GCRGeneration.generate(native)
        expect(withOption).toEqual(without)
    })
})

// --- Builders + sign()

const MNEMONIC = "test test test test test test test test test test test junk"

async function demosSeeing(gating: boolean | "unreachable") {
    const demos = new Demos()
    if (gating === "unreachable") {
        jest.spyOn(demos, "getNetworkInfo").mockRejectedValue(new Error("down"))
    } else {
        jest.spyOn(demos, "getNetworkInfo").mockResolvedValue({
            forks: {
                osDenomination: { activated: true, activationHeight: 0, currentHeight: 10 },
                ...(gating
                    ? {
                          nftValidatorGating: {
                              activated: true,
                              activationHeight: 0,
                              currentHeight: 10,
                          },
                      }
                    : {}),
            },
        } as never)
    }
    jest.spyOn(demos, "getAddressNonce").mockResolvedValue(7)
    jest.spyOn(demos, "getLastBlockNumber").mockResolvedValue(100)
    ;(demos as any)._getNetworkParametersCached = async () => ({ networkFee: 1, rpcFee: 0 })
    await demos.connectWallet(MNEMONIC, { algorithm: "ed25519" })
    const sign = jest.spyOn(demos, "sign")
    return { demos, sign }
}

afterEach(() => jest.restoreAllMocks())

describe("stake() and challengeValidator() under nftValidatorGating", () => {
    test("an NFT stake signs amount 0, the proof, and the edits the node regenerates", async () => {
        const { demos } = await demosSeeing(true)
        const tx = await DemosTransactions.stake("0", "https://v1.example", demos, { nft: NFT })
        const sender = demos.getAddress()

        expect(tx.content.data).toEqual([
            "validatorStake",
            { amount: "0", connectionUrl: "https://v1.example", nft: NFT },
        ])
        expect(tx.content.gcr_edits).toEqual([
            {
                type: "validatorStake",
                isRollback: false,
                account: sender,
                operation: "stake",
                amount: "0",
                connectionUrl: "https://v1.example",
                nft: NFT,
                txhash: "",
            },
            { type: "nonce", operation: "add", account: sender, amount: 1, txhash: "", isRollback: false },
        ])
        expect(sameAsNode(tx.content.gcr_edits, await nodeRegenerated(tx))).toBe(true)
        expect(tx.signature?.data).toMatch(/^(0x)?[0-9a-f]+$/)
    })

    test("the comparison catches a fork-unaware signer, whose stake still carries gas", async () => {
        const { demos } = await demosSeeing(true)
        const tx = await DemosTransactions.stake("0", "https://v1.example", demos, { nft: NFT })
        const unaware = await GCRGeneration.generate(JSON.parse(JSON.stringify(tx)) as Transaction)
        expect(sameAsNode(toWireShape(unaware, true), await nodeRegenerated(tx))).toBe(false)
    })

    test("a top-up without a proof is gasless and matches the node", async () => {
        const { demos } = await demosSeeing(true)
        const tx = await DemosTransactions.stake("0", "https://v1.example", demos)
        expect(shape(tx.content.gcr_edits)).toEqual(["validatorStake:stake", "nonce:add"])
        expect(sameAsNode(tx.content.gcr_edits, await nodeRegenerated(tx))).toBe(true)
    })

    test("unstake and exit sign no gas and match the node", async () => {
        const { demos } = await demosSeeing(true)
        for (const tx of [
            await DemosTransactions.unstake(demos),
            await DemosTransactions.validatorExit(demos),
        ]) {
            expect(tx.content.gcr_edits.some(e => e.type === "balance")).toBe(false)
            expect(sameAsNode(tx.content.gcr_edits, await nodeRegenerated(tx))).toBe(true)
        }
    })

    test("a challenge signs an evict edit equal to the node's, naming the lowercase address", async () => {
        const { demos } = await demosSeeing(true)
        const target = "B".repeat(64)
        const tx = await DemosTransactions.challengeValidator(target, EVIDENCE, SIG, demos)

        expect(tx.content.type).toBe("validatorChallenge")
        expect(tx.content.to).toBe("0x" + "b".repeat(64))
        expect(tx.content.data).toEqual([
            "validatorChallenge",
            { validator: "0x" + "b".repeat(64), evidenceTx: EVIDENCE, proofTx: SIG },
        ])
        expect(shape(tx.content.gcr_edits)).toEqual(["validatorStake:evict", "nonce:add"])
        expect(tx.content.gcr_edits[0]).toMatchObject({
            account: "0x" + "b".repeat(64),
            evidenceTx: EVIDENCE,
            proofTx: SIG,
        })
        expect(sameAsNode(tx.content.gcr_edits, await nodeRegenerated(tx))).toBe(true)
    })

    test("a bonded stake is refused before signing", async () => {
        const { demos, sign } = await demosSeeing(true)
        await expect(
            DemosTransactions.stake("5000000000", "https://v1.example", demos),
        ).rejects.toThrow("Stake amount must be 0 on this network (nftValidatorGating)")
        expect(sign).not.toHaveBeenCalled()
    })

    test("a malformed proof is refused before signing", async () => {
        const { demos, sign } = await demosSeeing(true)
        await expect(
            DemosTransactions.stake("0", "https://v1.example", demos, {
                nft: { ...NFT, owner: "0xnotbase58" },
            }),
        ).rejects.toThrow("nft.owner")
        await expect(
            DemosTransactions.challengeValidator(OTHER, "0xabc", SIG, demos),
        ).rejects.toThrow("evidenceTx")
        await expect(
            DemosTransactions.challengeValidator("0x1234", EVIDENCE, SIG, demos),
        ).rejects.toThrow("ed25519")
        expect(sign).not.toHaveBeenCalled()
    })

    test("other tx types sign the same edits as without the fork", async () => {
        const gated = await demosSeeing(true)
        const plain = await demosSeeing(false)
        const a = await DemosTransactions.pay(OTHER, 1_000_000_000n, gated.demos)
        const b = await DemosTransactions.pay(OTHER, 1_000_000_000n, plain.demos)
        expect(shape(a.content.gcr_edits)).toEqual(shape(b.content.gcr_edits))
        expect(shape(a.content.gcr_edits)).toContain("balance:remove")
    })
})

describe("stake() and challengeValidator() without the fork", () => {
    test.each([[false], ["unreachable" as const]])(
        "an NFT stake is refused before signing (network: %s)",
        async gating => {
            const { demos, sign } = await demosSeeing(gating)
            await expect(
                DemosTransactions.stake("0", "https://v1.example", demos, { nft: NFT }),
            ).rejects.toThrow("nftValidatorGating is not active")
            await expect(
                DemosTransactions.stake("5000000000", "https://v1.example", demos, { nft: NFT }),
            ).rejects.toThrow("nftValidatorGating is not active")
            expect(sign).not.toHaveBeenCalled()
        },
    )

    test.each([[false], ["unreachable" as const]])(
        "a challenge is refused before signing (network: %s)",
        async gating => {
            const { demos, sign } = await demosSeeing(gating)
            await expect(
                DemosTransactions.challengeValidator(OTHER, EVIDENCE, SIG, demos),
            ).rejects.toThrow("validatorChallenge needs nftValidatorGating active")
            expect(sign).not.toHaveBeenCalled()
        },
    )

    test("a zero stake is refused as before", async () => {
        const { demos, sign } = await demosSeeing(false)
        await expect(
            DemosTransactions.stake("0", "https://v1.example", demos),
        ).rejects.toThrow("Stake amount must be greater than 0")
        expect(sign).not.toHaveBeenCalled()
    })

    test("a bonded stake signs the same edits as before, gas included", async () => {
        const { demos } = await demosSeeing(false)
        const tx = await DemosTransactions.stake("5000000000", "https://v1.example", demos)
        const sender = demos.getAddress()
        expect(tx.content.data).toEqual([
            "validatorStake",
            { amount: "5000000000", connectionUrl: "https://v1.example" },
        ])
        expect(shape(tx.content.gcr_edits)).toEqual([
            "validatorStake:stake",
            "balance:remove",
            "nonce:add",
        ])
        expect(tx.content.gcr_edits[0]).not.toHaveProperty("nft")
        // What a node without the fork regenerates: the generator's plain output.
        const regenerated = await GCRGeneration.generate(
            JSON.parse(JSON.stringify(tx)) as Transaction,
        )
        expect(sameAsNode(tx.content.gcr_edits, regenerated)).toBe(true)
        expect((tx.content.gcr_edits[1] as any).account).toBe(sender)
    })

    test("unstake keeps its gas edit", async () => {
        const { demos } = await demosSeeing(false)
        const tx = await DemosTransactions.unstake(demos)
        expect(shape(tx.content.gcr_edits)).toEqual([
            "validatorStake:unstake",
            "balance:remove",
            "nonce:add",
        ])
    })
})
