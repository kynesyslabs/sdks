import { Demos } from "@/websdk/demosclass"
import { DemosTransactions } from "@/websdk/DemosTransactions"
import { EscrowTransaction } from "@/escrow/EscrowTransaction"
import { SubDemPrecisionError } from "@/denomination/networkInfo"
import { OS_PER_DEM } from "@/denomination"

// REVIEW: PR-86 review fixes — covers myc#15 (reject fractional /
// negative DEM number inputs; replace magic 1_000_000_000n with
// OS_PER_DEM) and myc#13 (no bigint leak from sign() into
// downstream JSON.stringify; broadcast bytes match hashed bytes).

/**
 * Stub the network surface of a `Demos` instance so `sign()` can run
 * without a live node. Mirrors the helper in `wireFormat.spec.ts` but
 * lives in this file to keep the regression suite self-contained.
 */
function stubNetwork(
    demos: Demos,
    networkInfo:
        | {
              activated: boolean
              activationHeight: number | null
              currentHeight: number
          }
        | null,
) {
    ;(demos as any).nodeCall = async (message: string) => {
        if (message === "getNetworkInfo") {
            if (networkInfo === null) return null
            return {
                forks: {
                    osDenomination: {
                        activationHeight: networkInfo.activationHeight,
                        activated: networkInfo.activated,
                        currentHeight: networkInfo.currentHeight,
                    },
                },
            }
        }
        if (message === "getAddressNonce") {
            return { response: 0 }
        }
        if (message === "getNetworkParameters") {
            return null
        }
        return null
    }
    ;(demos as any)._getNetworkParametersCached = async () => null
}

async function buildSignableDemos(networkInfo: Parameters<typeof stubNetwork>[1]): Promise<Demos> {
    const demos = new Demos()
    stubNetwork(demos, networkInfo)
    const mnemonic = demos.newMnemonic()
    await demos.connectWallet(mnemonic)
    return demos
}

describe("DemosTransactions._demNumberToOsBigint (myc#15)", () => {
    test("accepts whole DEM number input", () => {
        expect(DemosTransactions._demNumberToOsBigint(0)).toBe(0n)
        expect(DemosTransactions._demNumberToOsBigint(1)).toBe(OS_PER_DEM)
        expect(DemosTransactions._demNumberToOsBigint(100)).toBe(
            100n * OS_PER_DEM,
        )
    })

    test("rejects fractional DEM input instead of silently flooring", () => {
        expect(() => DemosTransactions._demNumberToOsBigint(1.5)).toThrow(
            /fractional DEM not supported/,
        )
        expect(() => DemosTransactions._demNumberToOsBigint(0.000000001)).toThrow(
            /fractional DEM not supported/,
        )
    })

    test("rejects negative DEM input", () => {
        expect(() => DemosTransactions._demNumberToOsBigint(-1)).toThrow(
            /must be a non-negative finite number/,
        )
    })

    test("rejects NaN / Infinity DEM input", () => {
        expect(() => DemosTransactions._demNumberToOsBigint(NaN)).toThrow(
            /must be a non-negative finite number/,
        )
        expect(() =>
            DemosTransactions._demNumberToOsBigint(Number.POSITIVE_INFINITY),
        ).toThrow(/must be a non-negative finite number/)
    })

    test("uses OS_PER_DEM constant (no magic literal divergence)", () => {
        // If the implementation drifted from OS_PER_DEM the result here
        // would not equal exactly `n * OS_PER_DEM`. This pins the
        // contract.
        for (const n of [1, 7, 1_000_000]) {
            expect(DemosTransactions._demNumberToOsBigint(n)).toBe(
                BigInt(n) * OS_PER_DEM,
            )
        }
    })
})

describe("EscrowTransaction.normalizeAmountInput (myc#15)", () => {
    test("accepts whole DEM number input", () => {
        const { amountDem, amountOs } = EscrowTransaction.normalizeAmountInput(
            100,
        )
        expect(amountDem).toBe(100)
        expect(amountOs).toBe(100n * OS_PER_DEM)
    })

    test("rejects fractional DEM number input instead of silent floor", () => {
        expect(() =>
            EscrowTransaction.normalizeAmountInput(1.5),
        ).toThrow(/fractional DEM not supported/)
    })

    test("rejects negative DEM number input", () => {
        expect(() => EscrowTransaction.normalizeAmountInput(-1)).toThrow(
            /must be a non-negative finite number/,
        )
    })

    test("rejects negative bigint OS input", () => {
        expect(() => EscrowTransaction.normalizeAmountInput(-1n)).toThrow(
            /must be non-negative/,
        )
    })

    test("accepts sub-DEM precision bigint OS input (rejection happens at public-API guard)", () => {
        const { amountOs } = EscrowTransaction.normalizeAmountInput(
            1_500_000_000n,
        )
        expect(amountOs).toBe(1_500_000_000n)
    })
})

describe("DemosTransactions.pay sub-DEM guard (myc#15)", () => {
    test("pre-fork: rejects sub-DEM bigint OS amount via shared guard", async () => {
        const demos = await buildSignableDemos({
            activated: false,
            activationHeight: null,
            currentHeight: 10,
        })
        // Suppress the warn-once from getNetworkInfo if it fires.
        const warnSpy = jest
            .spyOn(console, "warn")
            .mockImplementation(() => {})
        try {
            await expect(
                DemosTransactions.pay(
                    "0x" + "a".repeat(64),
                    1_500_000_000n,
                    demos,
                ),
            ).rejects.toBeInstanceOf(SubDemPrecisionError)
        } finally {
            warnSpy.mockRestore()
        }
    })

    test("pre-fork: rejects negative bigint OS amount", async () => {
        const demos = await buildSignableDemos({
            activated: false,
            activationHeight: null,
            currentHeight: 10,
        })
        await expect(
            DemosTransactions.pay("0x" + "a".repeat(64), -1n, demos),
        ).rejects.toThrow(/must be non-negative/)
    })

    test("post-fork: accepts sub-DEM bigint OS amount", async () => {
        const demos = await buildSignableDemos({
            activated: true,
            activationHeight: 50,
            currentHeight: 100,
        })
        // Should not throw. Resolves to a signed Transaction.
        const tx = await DemosTransactions.pay(
            "0x" + "a".repeat(64),
            1_500_000_000n,
            demos,
        )
        expect(tx).toBeTruthy()
    })
})

describe("Demos.sign content normalisation (myc#13)", () => {
    test("post-fork: signed tx.content is JSON-serialisable (no bigint leak)", async () => {
        const demos = await buildSignableDemos({
            activated: true,
            activationHeight: 50,
            currentHeight: 100,
        })
        const tx = await demos.pay("0x" + "a".repeat(64), 100_000_000_001n)
        // If anything internal leaked a bigint into tx.content, this
        // would throw "TypeError: Do not know how to serialize a BigInt".
        const stringified = JSON.stringify(tx.content)
        expect(typeof stringified).toBe("string")
        const parsed = JSON.parse(stringified)
        // amount on the wire is the canonical OS decimal string.
        expect(parsed.amount).toBe("100000000001")
        expect(typeof parsed.amount).toBe("string")
        // gcr_edits[].amount carriers must also be wire-shape (not bigint).
        for (const edit of parsed.gcr_edits) {
            if (edit.type === "balance") {
                expect(typeof edit.amount === "string" || typeof edit.amount === "number").toBe(
                    true,
                )
            }
        }
    })

    test("pre-fork: signed tx.content is JSON-serialisable (no bigint leak)", async () => {
        const warnSpy = jest
            .spyOn(console, "warn")
            .mockImplementation(() => {})
        try {
            const demos = await buildSignableDemos({
                activated: false,
                activationHeight: null,
                currentHeight: 10,
            })
            const tx = await demos.pay(
                "0x" + "a".repeat(64),
                100n * OS_PER_DEM,
            )
            const stringified = JSON.stringify(tx.content)
            expect(typeof stringified).toBe("string")
            const parsed = JSON.parse(stringified)
            // Pre-fork: amount is JS number DEM.
            expect(parsed.amount).toBe(100)
            expect(typeof parsed.amount).toBe("number")
        } finally {
            warnSpy.mockRestore()
        }
    })

    test("broadcast bytes match hashed bytes", async () => {
        // Regression for myc#13: hashing one shape and then sending a
        // different shape would trigger InvalidSignature on the node.
        const demos = await buildSignableDemos({
            activated: true,
            activationHeight: 50,
            currentHeight: 100,
        })
        const tx = await demos.pay("0x" + "a".repeat(64), OS_PER_DEM)
        // The hash on the tx is sha256(serializeTransactionContent(content, true)).
        // After our fix, content has been normalised in place, so
        // re-hashing the now-normalised content via the same path must
        // produce the same hash.
        const {
            serializeTransactionContent,
        } = await import("@/denomination/serializerGate")
        const { Hashing } = await import("@/encryption/Hashing")
        const reHash = Hashing.sha256(
            serializeTransactionContent(tx.content, true),
        )
        expect(reHash).toBe(tx.hash)
    })
})
