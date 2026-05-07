import { Demos } from "@/websdk/demosclass"
import { SubDemPrecisionError } from "@/denomination/networkInfo"
import { OS_PER_DEM } from "@/denomination"

// REVIEW: P4 commit 4 — end-to-end wire-format compatibility tests.
// These run `demos.sign(tx)` against a fully-stubbed RPC layer (so no
// real node is needed) and assert byte-level shape on the bytes that
// would be hashed.

/**
 * Stub the network-facing surface of a `Demos` instance so `sign()` can
 * run without a live node. We replace:
 *
 *   - `nodeCall` to feed the desired `getNetworkInfo` payload, and
 *     simple stubbed responses for nonce / network-parameters lookups.
 *   - `_getNetworkParametersCached` to return null so the SDK falls
 *     into the local fee-derivation path.
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

/**
 * Capture the bytes that would be hashed by intercepting `Hashing.sha256`
 * on the next call. Returns a getter for the most-recent hashed string.
 *
 * Implementation detail: we wrap `serializeTransactionContent` indirectly
 * by spying on `JSON.stringify` is brittle; instead we capture the
 * result via the public `tx.hash` (which is `sha256(serializedContent)`)
 * and also store the input by replacing the SDK's `serializeTransactionContent`
 * import. To stay decoupled, this helper instead uses a dedicated hash
 * spy via Hashing module.
 */
function captureSerializedBytes(): {
    install: () => void
    uninstall: () => void
    last: () => string | null
} {
    let last: string | null = null
    let originalStringify: typeof JSON.stringify | null = null

    return {
        install() {
            originalStringify = JSON.stringify
            ;(JSON as any).stringify = (
                value: unknown,
                replacer?: any,
                space?: any,
            ): string => {
                const out = originalStringify!(value, replacer, space)
                // Heuristic: only capture stringifies of objects that
                // look like a TransactionContent (have an `amount`
                // and `gcr_edits` field).
                if (
                    typeof value === "object" &&
                    value !== null &&
                    "gcr_edits" in (value as Record<string, unknown>) &&
                    "amount" in (value as Record<string, unknown>) &&
                    "transaction_fee" in (value as Record<string, unknown>)
                ) {
                    last = out
                }
                return out
            }
        },
        uninstall() {
            if (originalStringify) {
                ;(JSON as any).stringify = originalStringify
                originalStringify = null
            }
        },
        last: () => last,
    }
}

/**
 * Build a `Demos` instance with a wallet and the network stubbed. Uses
 * a fresh BIP39 mnemonic each call so tests don't share state.
 */
async function buildSignableDemos(networkInfo: Parameters<typeof stubNetwork>[1]): Promise<Demos> {
    const demos = new Demos()
    stubNetwork(demos, networkInfo)
    const mnemonic = demos.newMnemonic()
    await demos.connectWallet(mnemonic)
    return demos
}

describe("Pre-fork wire shape", () => {
    let warnSpy: jest.SpyInstance
    beforeEach(() => {
        warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    })
    afterEach(() => warnSpy.mockRestore())

    test("amount on the wire is a JS number in DEM", async () => {
        const demos = await buildSignableDemos({
            activated: false,
            activationHeight: null,
            currentHeight: 10,
        })
        const cap = captureSerializedBytes()
        cap.install()
        try {
            // Use the public API path so `data` gets the right wire
            // shape from `DemosTransactions.pay`.
            await demos.pay("0x" + "a".repeat(64), 100_000_000_000n)
        } finally {
            cap.uninstall()
        }
        const hashed = cap.last()
        expect(hashed).not.toBeNull()
        const parsed = JSON.parse(hashed!)
        expect(parsed.amount).toBe(100)
        expect(typeof parsed.amount).toBe("number")
        // Pre-fork: fee carriers are JS numbers in DEM. We don't assert
        // the derived value here because `_calculateAndApplyGasFee`
        // computes it from `gcr_edits` differences and can vary.
        expect(typeof parsed.transaction_fee.network_fee).toBe("number")
        expect(typeof parsed.transaction_fee.rpc_fee).toBe("number")
        expect(typeof parsed.transaction_fee.additional_fee).toBe("number")
    })

    test("sub-DEM precision is rejected before signing", async () => {
        const demos = await buildSignableDemos({
            activated: false,
            activationHeight: null,
            currentHeight: 10,
        })
        // Sub-DEM input via demos.transfer — guard runs in pay().
        let caught: unknown = null
        try {
            await demos.transfer("0x" + "a".repeat(64), 1n)
        } catch (e) {
            caught = e
        }
        expect(caught).toBeInstanceOf(SubDemPrecisionError)
    })
})

describe("Post-fork wire shape", () => {
    test("amount on the wire is an OS decimal string", async () => {
        const demos = await buildSignableDemos({
            activated: true,
            activationHeight: 50,
            currentHeight: 100,
        })
        const cap = captureSerializedBytes()
        cap.install()
        try {
            await demos.pay("0x" + "a".repeat(64), 100_000_000_001n)
        } finally {
            cap.uninstall()
        }
        const hashed = cap.last()
        expect(hashed).not.toBeNull()
        const parsed = JSON.parse(hashed!)
        expect(parsed.amount).toBe("100000000001")
        expect(typeof parsed.amount).toBe("string")
        // Post-fork: fee carriers are decimal OS strings.
        expect(typeof parsed.transaction_fee.network_fee).toBe("string")
        expect(typeof parsed.transaction_fee.rpc_fee).toBe("string")
        expect(typeof parsed.transaction_fee.additional_fee).toBe("string")
        // The derived value, whatever it is, must parse as a non-negative
        // base-10 integer.
        expect(parsed.transaction_fee.network_fee).toMatch(/^\d+$/)
    })

    test("sub-DEM precision is allowed against post-fork", async () => {
        const demos = await buildSignableDemos({
            activated: true,
            activationHeight: 50,
            currentHeight: 100,
        })
        // Should not throw — post-fork can express sub-DEM precision.
        await expect(
            (demos as any)._assertAmountAcceptableOnTargetNode(1n),
        ).resolves.toBeUndefined()
    })

    test("hashed content preserves canonical key order", async () => {
        const demos = await buildSignableDemos({
            activated: true,
            activationHeight: 50,
            currentHeight: 100,
        })
        const cap = captureSerializedBytes()
        cap.install()
        try {
            await demos.pay("0x" + "a".repeat(64), OS_PER_DEM)
        } finally {
            cap.uninstall()
        }
        const hashed = cap.last()
        const parsed = JSON.parse(hashed!)
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
})
