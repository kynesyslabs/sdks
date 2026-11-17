import { runProgrammaticTx, totalFeeOs } from "@/websdk/programmatic/runner"
import { FeeCapExceededError } from "@/websdk/programmatic/errors"
import type {
    ProgrammaticTxOptions,
    TxConfirmInfo,
} from "@/websdk/programmatic/types"
import { demToOs } from "@/denomination"
import type { Demos } from "@/websdk/demosclass"
import type { Transaction } from "@/types"
import type { RPCResponseWithValidityData } from "@/types/communication/rpc"

// Unit tests for the shared programmatic-tx runner. Demos is fully mocked
// (plain object of jest.fn()s) — no network is touched. The runner reads
// validityData.response.data.{gas_operation.fees, transaction, reference_block}.

const OS_PER_DEM = 1_000_000_000n

/** A minimal fake confirmed transaction embedded in validity data. */
const fakeTransaction = {
    hash: "0xabc",
    signature: { type: "ed25519", data: "0xsig" },
    content: { type: "test", data: {} },
} as unknown as Transaction

/**
 * Build a fake RPCResponseWithValidityData carrying the given three fee
 * fields (whatever wire shape — number DEM or string OS). `data.valid` is
 * set true to mirror what a real `confirm` would return.
 */
function fakeValidityData(fees: {
    network_fee: number | string
    rpc_fee: number | string
    additional_fee: number | string
}): RPCResponseWithValidityData {
    return {
        result: 200,
        require_reply: false,
        extra: null,
        response: {
            data: {
                valid: true,
                transaction: fakeTransaction,
                reference_block: 42,
                gas_operation: {
                    fees: {
                        network_fee: fees.network_fee,
                        rpc_fee: fees.rpc_fee,
                        additional_fee: fees.additional_fee,
                        rpc_address: null,
                    },
                },
            },
        },
    } as unknown as RPCResponseWithValidityData
}

/** A mocked Demos whose sign/confirm return the provided validity data. */
function makeMockDemos(validityData: RPCResponseWithValidityData) {
    const sign = jest.fn(async (tx: Transaction) => tx)
    const confirm = jest.fn(async () => validityData)
    const broadcast = jest.fn(async () => ({
        result: 200,
        response: { data: { broadcasted: true } },
        require_reply: false,
        extra: null,
    }))
    const broadcastAndWait = jest.fn(async () => ({
        result: 200,
        response: { data: { included: true } },
        require_reply: false,
        extra: null,
    }))
    const demos = {
        sign,
        confirm,
        broadcast,
        broadcastAndWait,
    } as unknown as Demos
    return { demos, sign, confirm, broadcast, broadcastAndWait }
}

/** An unsigned transaction (signature: null) the runner must sign first. */
const unsignedTx = {
    hash: "0xabc",
    signature: null,
    content: { type: "test", data: {} },
} as unknown as Transaction

describe("totalFeeOs — fee wire-shape normalisation", () => {
    test("pre-fork shape: number DEM fields sum into OS bigint", () => {
        const vd = fakeValidityData({
            network_fee: 1,
            rpc_fee: 1,
            additional_fee: 1,
        })
        expect(totalFeeOs(vd)).toBe(3n * OS_PER_DEM)
    })

    test("post-fork shape: integer OS strings sum as OS", () => {
        const vd = fakeValidityData({
            network_fee: "1000000000",
            rpc_fee: "2000000000",
            additional_fee: "500000000",
        })
        expect(totalFeeOs(vd)).toBe(3_500_000_000n)
    })

    test("missing gas_operation yields 0n", () => {
        const vd = {
            response: { data: {} },
        } as unknown as RPCResponseWithValidityData
        expect(totalFeeOs(vd)).toBe(0n)
    })

    test("falls back to transaction.content.transaction_fee when gas_operation is null (real-node shape)", () => {
        // Live nodes return gas_operation: null and carry the fee on the
        // confirmed transaction itself (OS strings). Verified against a
        // real node: network_fee 1 DEM + rpc_fee 1 DEM => 2 DEM.
        const vd = {
            response: {
                data: {
                    valid: true,
                    reference_block: 42,
                    gas_operation: null,
                    transaction: {
                        hash: "0xabc",
                        content: {
                            transaction_fee: {
                                network_fee: "1000000000",
                                rpc_fee: "1000000000",
                                additional_fee: "0",
                                rpc_address: null,
                            },
                        },
                    },
                },
            },
        } as unknown as RPCResponseWithValidityData
        expect(totalFeeOs(vd)).toBe(2n * OS_PER_DEM)
    })
})

describe("runProgrammaticTx — auto mode & fee cap", () => {
    test("within default cap: broadcasts once, reports fee", async () => {
        const vd = fakeValidityData({
            network_fee: 1,
            rpc_fee: 1,
            additional_fee: 1,
        })
        const { demos, broadcast, broadcastAndWait } = makeMockDemos(vd)

        const result = await runProgrammaticTx(demos, vd)

        expect(broadcast).toHaveBeenCalledTimes(1)
        expect(broadcast).toHaveBeenCalledWith(vd)
        expect(broadcastAndWait).not.toHaveBeenCalled()
        expect(result.broadcasted).toBe(true)
        expect(result.feeOs).toBe(3n * OS_PER_DEM)
        expect(result.feeDem).toBe("3.0")
        expect(result.hash).toBe("0xabc")
        expect(result.broadcast).toBeDefined()
    })

    test("over default cap: rejects with FeeCapExceededError, never broadcasts", async () => {
        const vd = fakeValidityData({
            network_fee: 2,
            rpc_fee: 2,
            additional_fee: 2,
        })
        const { demos, broadcast } = makeMockDemos(vd)

        expect.assertions(4)
        try {
            await runProgrammaticTx(demos, vd)
        } catch (err) {
            expect(err).toBeInstanceOf(FeeCapExceededError)
            const e = err as FeeCapExceededError
            expect(e.feeOs).toBe(6n * OS_PER_DEM)
            expect(e.capOs).toBe(5n * OS_PER_DEM)
        }
        expect(broadcast).not.toHaveBeenCalled()
    })

    test("maxFee override raises the ceiling so a 6-DEM fee broadcasts", async () => {
        const vd = fakeValidityData({
            network_fee: 2,
            rpc_fee: 2,
            additional_fee: 2,
        })
        const { demos, broadcast } = makeMockDemos(vd)

        const opts: ProgrammaticTxOptions = { maxFee: 10 }
        const result = await runProgrammaticTx(demos, vd, opts)

        expect(broadcast).toHaveBeenCalledTimes(1)
        expect(result.broadcasted).toBe(true)
        expect(result.feeOs).toBe(6n * OS_PER_DEM)
    })

    test("maxFee: null disables the cap (huge fee still broadcasts)", async () => {
        const vd = fakeValidityData({
            network_fee: 1_000_000,
            rpc_fee: 1_000_000,
            additional_fee: 1_000_000,
        })
        const { demos, broadcast } = makeMockDemos(vd)

        const result = await runProgrammaticTx(demos, vd, { maxFee: null })

        expect(broadcast).toHaveBeenCalledTimes(1)
        expect(result.broadcasted).toBe(true)
        expect(result.feeOs).toBe(3_000_000n * OS_PER_DEM)
    })
})

describe("runProgrammaticTx — manual mode", () => {
    test("returns unbroadcast validity data with skippedReason", async () => {
        const vd = fakeValidityData({
            network_fee: 1,
            rpc_fee: 1,
            additional_fee: 1,
        })
        const { demos, broadcast, broadcastAndWait } = makeMockDemos(vd)

        const result = await runProgrammaticTx(demos, vd, { confirm: "manual" })

        expect(result.broadcasted).toBe(false)
        expect(result.skippedReason).toBe("manual")
        expect(result.validityData).toBe(vd)
        expect(result.feeOs).toBe(3n * OS_PER_DEM)
        expect(broadcast).not.toHaveBeenCalled()
        expect(broadcastAndWait).not.toHaveBeenCalled()
    })
})

describe("runProgrammaticTx — callback mode", () => {
    test("callback returning false skips broadcast with reason 'rejected'", async () => {
        const vd = fakeValidityData({
            network_fee: 1,
            rpc_fee: 1,
            additional_fee: 1,
        })
        const { demos, broadcast } = makeMockDemos(vd)

        const cb = jest.fn(() => false)
        const result = await runProgrammaticTx(demos, vd, { confirm: cb })

        expect(cb).toHaveBeenCalledTimes(1)
        expect(result.broadcasted).toBe(false)
        expect(result.skippedReason).toBe("rejected")
        expect(broadcast).not.toHaveBeenCalled()
    })

    test("callback is the sole authority: returns true over the default cap → broadcasts", async () => {
        const vd = fakeValidityData({
            network_fee: 3,
            rpc_fee: 3,
            additional_fee: 3,
        })
        const { demos, broadcast } = makeMockDemos(vd)

        let seen: TxConfirmInfo | undefined
        const cb = jest.fn((info: TxConfirmInfo) => {
            seen = info
            return true
        })
        const result = await runProgrammaticTx(demos, vd, { confirm: cb })

        expect(broadcast).toHaveBeenCalledTimes(1)
        expect(result.broadcasted).toBe(true)
        // The callback received the fee snapshot, and withinFeeCap reflects
        // the default cap (9 DEM > 5 DEM) even though it is not enforced.
        expect(seen).toBeDefined()
        expect(seen!.feeOs).toBe(9n * OS_PER_DEM)
        expect(seen!.feeDem).toBe("9.0")
        expect(seen!.withinFeeCap).toBe(false)
    })
})

describe("runProgrammaticTx — wait mode", () => {
    test("wait: true uses broadcastAndWait instead of broadcast", async () => {
        const vd = fakeValidityData({
            network_fee: 1,
            rpc_fee: 1,
            additional_fee: 1,
        })
        const { demos, broadcast, broadcastAndWait } = makeMockDemos(vd)

        const waitOptions = { timeoutMs: 1234, pollIntervalMs: 10 }
        const result = await runProgrammaticTx(demos, vd, {
            wait: true,
            waitOptions,
        })

        expect(broadcastAndWait).toHaveBeenCalledTimes(1)
        expect(broadcastAndWait).toHaveBeenCalledWith(vd, waitOptions)
        expect(broadcast).not.toHaveBeenCalled()
        expect(result.broadcasted).toBe(true)
    })
})

describe("runProgrammaticTx — source resolution", () => {
    test("unsigned Transaction is signed then confirmed", async () => {
        const vd = fakeValidityData({
            network_fee: 1,
            rpc_fee: 1,
            additional_fee: 1,
        })
        const { demos, sign, confirm } = makeMockDemos(vd)

        const result = await runProgrammaticTx(demos, unsignedTx)

        expect(sign).toHaveBeenCalledTimes(1)
        expect(sign).toHaveBeenCalledWith(unsignedTx, undefined)
        expect(confirm).toHaveBeenCalledTimes(1)
        expect(result.broadcasted).toBe(true)
    })

    test("already-confirmed validityData skips sign and confirm entirely", async () => {
        const vd = fakeValidityData({
            network_fee: 1,
            rpc_fee: 1,
            additional_fee: 1,
        })
        const { demos, sign, confirm, broadcast } = makeMockDemos(vd)

        const result = await runProgrammaticTx(demos, vd)

        expect(sign).not.toHaveBeenCalled()
        expect(confirm).not.toHaveBeenCalled()
        expect(broadcast).toHaveBeenCalledTimes(1)
        expect(result.validityData).toBe(vd)
    })

    test("token-shape tx (truthy but empty signature) is still signed", async () => {
        // DemosTokens builds an UNSIGNED tx with a placeholder
        // `signature: { type: "ed25519", data: "" }` — truthy but empty. The
        // runner must sign it (gate on signature.data, not truthiness),
        // otherwise every demos.run.tokens.* ships an empty-signature tx.
        const tokenShapeTx = {
            hash: "",
            signature: { type: "ed25519", data: "" },
            content: { type: "tokenExecution", data: {} },
        } as unknown as Transaction
        const vd = fakeValidityData({
            network_fee: 1,
            rpc_fee: 1,
            additional_fee: 1,
        })
        const { demos, sign, confirm } = makeMockDemos(vd)

        await runProgrammaticTx(demos, tokenShapeTx)

        expect(sign).toHaveBeenCalledTimes(1)
        expect(sign).toHaveBeenCalledWith(tokenShapeTx, undefined)
        expect(confirm).toHaveBeenCalledTimes(1)
    })
})

describe("runProgrammaticTx — maxFee edge values", () => {
    test("maxFee: Infinity disables the cap (huge fee broadcasts)", async () => {
        const vd = fakeValidityData({
            network_fee: 1_000_000,
            rpc_fee: 0,
            additional_fee: 0,
        })
        const { demos, broadcast } = makeMockDemos(vd)

        const result = await runProgrammaticTx(demos, vd, { maxFee: Infinity })

        expect(broadcast).toHaveBeenCalledTimes(1)
        expect(result.broadcasted).toBe(true)
    })

    test("maxFee: NaN does NOT silently disable the cap — it throws", async () => {
        const vd = fakeValidityData({
            network_fee: 1,
            rpc_fee: 1,
            additional_fee: 1,
        })
        const { demos, broadcast } = makeMockDemos(vd)

        await expect(
            runProgrammaticTx(demos, vd, { maxFee: NaN }),
        ).rejects.toThrow()
        expect(broadcast).not.toHaveBeenCalled()
    })
})

// node#1174 quotes a native transaction only when its operation is "send".
const SEND_DATA = ["native", { nativeOperation: "send", args: ["0xto", "1"] }]

/**
 * A native send confirm response in the live-node shape (`gas_operation:
 * null`, fee on `transaction.content.transaction_fee`). `totalFee`, when
 * given, is the node's charged-fee quote in `transaction.attrs.total_fee`
 * (kynesyslabs/node#1174); omit it for a node without that change.
 * `quotedAt` is the quote's `attrs.reference_block`; the confirmation's own
 * `reference_block` is 42.
 */
function nativeSendValidityData(
    fee: { network_fee: number | string; rpc_fee: number | string },
    totalFee?: string | number,
    quotedAt = 42,
): RPCResponseWithValidityData {
    return {
        result: 200,
        require_reply: false,
        extra: null,
        response: {
            data: {
                valid: true,
                reference_block: 42,
                gas_operation: null,
                transaction: {
                    hash: "0xabc",
                    signature: { type: "ed25519", data: "0xsig" },
                    content: {
                        type: "native",
                        data: SEND_DATA,
                        transaction_fee: {
                            ...fee,
                            additional_fee: typeof fee.rpc_fee === "number" ? 0 : "0",
                            rpc_address: null,
                        },
                    },
                    attrs:
                        totalFee === undefined
                            ? { reference_block: quotedAt }
                            : { reference_block: quotedAt, total_fee: totalFee },
                },
            },
        },
    } as unknown as RPCResponseWithValidityData
}

// Signed distribution fees of 1 + 1 DEM, in each wire shape.
const OS_FEE = { network_fee: "1000000000", rpc_fee: "1000000000" }
const DEM_FEE = { network_fee: 1, rpc_fee: 1 }

/** `vd` with its echoed `network_fee` removed (`"missing"`) or set. */
function withNetworkFee(
    vd: RPCResponseWithValidityData,
    form: string,
    networkFee: unknown,
): RPCResponseWithValidityData {
    const fee = vd.response.data.transaction.content
        .transaction_fee as unknown as Record<string, unknown>
    if (form === "missing") delete fee.network_fee
    else fee.network_fee = networkFee
    return vd
}

describe("totalFeeOs — node's charged native send fee (attrs.total_fee)", () => {
    test("uses the quote over the signed fee fields when it is higher", () => {
        // gasFeeSeparation active: gas edit + distribution = 3 DEM charged.
        const vd = nativeSendValidityData(OS_FEE, "3000000000")
        expect(totalFeeOs(vd)).toBe(3n * OS_PER_DEM)
    })

    test("uses the quote over the signed fee fields when it is lower", () => {
        // gasFeeSeparation not active: only the 1 DEM gas edit is charged.
        const vd = nativeSendValidityData(OS_FEE, "1000000000")
        expect(totalFeeOs(vd)).toBe(1n * OS_PER_DEM)
    })

    test("reads a pre-osDenomination quote as whole DEM", () => {
        // Such a node echoes `number` DEM fee fields and quotes in DEM.
        const vd = nativeSendValidityData(DEM_FEE, "3")
        expect(totalFeeOs(vd)).toBe(3n * OS_PER_DEM)
    })

    test("reads a quote as DEM after a number network_fee and as OS after a string one", () => {
        expect(totalFeeOs(nativeSendValidityData(DEM_FEE, "1"))).toBe(OS_PER_DEM)
        expect(totalFeeOs(nativeSendValidityData(OS_FEE, "1"))).toBe(1n)
    })

    test.each([
        ["missing", undefined, "undefined"],
        ["null", null, "null"],
        ["object", { amount: 1 }, `{"amount":1}`],
    ])("a quote with a %s network_fee throws instead of guessing its unit", (form, networkFee, shown) => {
        // A pre-osDenomination node quotes whole DEM: reading its "1" as
        // 1 OS would report the fee 10⁹ times too small and pass any cap.
        for (const quotedAt of [42, 41]) {
            const vd = withNetworkFee(
                nativeSendValidityData(DEM_FEE, "1", quotedAt),
                form,
                networkFee,
            )
            // A type check: a `TypeError`, naming the value (never
            // `[object Object]`).
            expect(() => totalFeeOs(vd)).toThrow(TypeError)
            expect(() => totalFeeOs(vd)).toThrow(
                `invalid fee quote "1" in the node's confirm response: ` +
                    `network_fee ${shown} does not tell its unit`,
            )
        }
    })

    test("without a quote keeps the summed fee fields", () => {
        expect(totalFeeOs(nativeSendValidityData(OS_FEE))).toBe(2n * OS_PER_DEM)
        expect(totalFeeOs(nativeSendValidityData(DEM_FEE))).toBe(2n * OS_PER_DEM)
    })

    test("an unparseable quote throws instead of reading as a zero fee", () => {
        const vd = nativeSendValidityData(OS_FEE, "3 DEM")
        expect(() => totalFeeOs(vd)).toThrow(/invalid fee quote "3 DEM"/)
    })

    test("a negative quote throws instead of passing the cap", () => {
        const os = nativeSendValidityData(OS_FEE, "-5")
        expect(() => totalFeeOs(os)).toThrow(/invalid fee quote "-5"/)
        // A pre-osDenomination DEM quote is refused the same way.
        const dem = nativeSendValidityData(DEM_FEE, "-1")
        expect(() => totalFeeOs(dem)).toThrow(/invalid fee quote "-1"/)
    })

    test.each([
        ["hex", "0x1"],
        ["binary", "0b1"],
        ["octal", "0o1"],
        ["plus sign", "+1"],
        ["minus zero", "-0"],
        ["leading space", " 1"],
        ["trailing space", "1 "],
        ["tab and newline", "\t1\n"],
        ["decimal point", "1.0"],
        ["fraction", "0.5"],
        ["exponent", "1e9"],
        ["upper-case exponent", "1E9"],
        ["leading zero", "01"],
        ["digit separator", "1_000"],
    ])("a quote in %s form throws instead of being converted", (_form, quote) => {
        // `BigInt("0x1")` is 1n and `demToOs("1_000")` is 1000 DEM: none of
        // these may reach the conversion, in either wire shape.
        for (const fee of [OS_FEE, DEM_FEE]) {
            const vd = nativeSendValidityData(fee, quote)
            expect(() => totalFeeOs(vd)).toThrow(
                `invalid fee quote ${JSON.stringify(quote)}`,
            )
        }
    })

    test("a quote of zero is accepted", () => {
        expect(totalFeeOs(nativeSendValidityData(OS_FEE, "0"))).toBe(0n)
        expect(totalFeeOs(nativeSendValidityData(DEM_FEE, "0"))).toBe(0n)
    })

    test("a numeric quote throws instead of falling back to the signed fee", () => {
        const vd = nativeSendValidityData(OS_FEE, 3_000_000_000)
        expect(() => totalFeeOs(vd)).toThrow(/invalid fee quote 3000000000/)
    })

    test("a blank quote throws instead of falling back to the signed fee", () => {
        expect(() => totalFeeOs(nativeSendValidityData(OS_FEE, ""))).toThrow(
            /invalid fee quote ""/,
        )
        expect(() => totalFeeOs(nativeSendValidityData(OS_FEE, "  "))).toThrow(
            /invalid fee quote " {2}"/,
        )
    })

    test("a quote for another reference block is ignored", () => {
        // Quoted at block 41, echoed in a confirmation at block 42: it was
        // not made for this confirmation, so the signed fee fields count.
        const vd = nativeSendValidityData(OS_FEE, "1000000000", 41)
        expect(totalFeeOs(vd)).toBe(2n * OS_PER_DEM)
    })
})

describe("totalFeeOs — OS fee fields that are not base-10 integers", () => {
    test.each([
        ["hex", "0x77359400"],
        ["plus sign", "+1000000000"],
        ["minus sign", "-1000000000"],
        ["leading zero", "01000000000"],
        ["exponent", "1e9"],
        ["surrounding spaces", " 1 "],
        ["whitespace-only", " "],
        ["empty", ""],
        ["short leading zero", "01"],
    ])("a fee field in %s form throws", (_form, networkFee) => {
        // `BigInt` reads the hex, signed, zero-padded and space-padded forms
        // as numbers, and a blank string as 0.
        for (const rpcFee of ["1000000000", "0"]) {
            const vd = nativeSendValidityData({
                network_fee: networkFee,
                rpc_fee: rpcFee,
            })
            expect(() => totalFeeOs(vd)).toThrow(
                `unparseable fee field ${JSON.stringify(networkFee)}`,
            )
        }
    })

    test("a fee field that is not a string or number throws", () => {
        // A one-element array would pass the pattern as its string form.
        const vd = nativeSendValidityData({
            network_fee: ["1"] as unknown as string,
            rpc_fee: "0",
        })
        expect(() => totalFeeOs(vd)).toThrow(`unparseable fee field ["1"]`)
    })
})

/** A signed native send (fee fields 1 + 1 DEM, in OS) with no quote. */
function signedNativeSend(): Transaction {
    return {
        hash: "0xabc",
        signature: { type: "ed25519", data: "0xsig" },
        content: {
            type: "native",
            data: SEND_DATA,
            transaction_fee: {
                ...OS_FEE,
                additional_fee: "0",
                rpc_address: null,
            },
        },
        attrs: {},
    } as unknown as Transaction
}

// The runner confirms the transaction itself (the mocked confirm returns
// the given response), so it trusts the quote in that response.
describe("runProgrammaticTx — fee cap on the node's charged fee", () => {
    test("a cap between the signed fee and the quote refuses the send", async () => {
        const vd = nativeSendValidityData(OS_FEE, "3000000000")
        const { demos, broadcast } = makeMockDemos(vd)

        expect.assertions(5)
        try {
            await runProgrammaticTx(demos, signedNativeSend(), { maxFee: 2.5 })
        } catch (err) {
            expect(err).toBeInstanceOf(FeeCapExceededError)
            const e = err as FeeCapExceededError
            expect(e.feeOs).toBe(3n * OS_PER_DEM)
            expect(e.capOs).toBe(demToOs("2.5"))
            expect(e.info.withinFeeCap).toBe(false)
        }
        expect(broadcast).not.toHaveBeenCalled()
    })

    test("the same cap without a quote broadcasts on the summed fee", async () => {
        const vd = nativeSendValidityData(OS_FEE)
        const { demos, broadcast } = makeMockDemos(vd)

        const result = await runProgrammaticTx(demos, signedNativeSend(), {
            maxFee: 2.5,
        })

        expect(broadcast).toHaveBeenCalledTimes(1)
        expect(result.feeOs).toBe(2n * OS_PER_DEM)
        expect(result.feeDem).toBe("2.0")
    })

    test("a quote below the signed fee is what the result reports", async () => {
        const vd = nativeSendValidityData(OS_FEE, "1000000000")
        const { demos, confirm, broadcast } = makeMockDemos(vd)

        const result = await runProgrammaticTx(demos, signedNativeSend(), {
            maxFee: 1.5,
        })

        expect(confirm).toHaveBeenCalledTimes(1)
        expect(broadcast).toHaveBeenCalledTimes(1)
        expect(result.feeOs).toBe(1n * OS_PER_DEM)
        expect(result.feeDem).toBe("1.0")
    })

    test("a negative quote refuses the send", async () => {
        const vd = nativeSendValidityData(OS_FEE, "-5")
        const { demos, broadcast } = makeMockDemos(vd)

        await expect(
            runProgrammaticTx(demos, signedNativeSend(), { maxFee: 2.5 }),
        ).rejects.toThrow(/invalid fee quote "-5"/)
        expect(broadcast).not.toHaveBeenCalled()
    })

    test("a numeric quote refuses the send", async () => {
        // Signed 2 DEM, indicated charge 3 DEM, cap 2.5 DEM.
        const vd = nativeSendValidityData(OS_FEE, 3_000_000_000)
        const { demos, broadcast } = makeMockDemos(vd)

        await expect(
            runProgrammaticTx(demos, signedNativeSend(), { maxFee: 2.5 }),
        ).rejects.toThrow(/invalid fee quote/)
        expect(broadcast).not.toHaveBeenCalled()
    })

    test("a hex quote refuses the send", async () => {
        // `BigInt("0x1")` would report 1 OS and pass the 2.5 DEM cap.
        const vd = nativeSendValidityData(OS_FEE, "0x1")
        const { demos, broadcast } = makeMockDemos(vd)

        await expect(
            runProgrammaticTx(demos, signedNativeSend(), { maxFee: 2.5 }),
        ).rejects.toThrow(/invalid fee quote "0x1"/)
        expect(broadcast).not.toHaveBeenCalled()
    })

    test("a quote with no network_fee refuses the send", async () => {
        // Read as OS, a pre-osDenomination 1 DEM quote would pass 2.5 DEM.
        const vd = withNetworkFee(
            nativeSendValidityData(DEM_FEE, "1"),
            "missing",
            undefined,
        )
        const { demos, broadcast } = makeMockDemos(vd)

        await expect(
            runProgrammaticTx(demos, signedNativeSend(), { maxFee: 2.5 }),
        ).rejects.toThrow(/invalid fee quote "1"/)
        expect(broadcast).not.toHaveBeenCalled()
    })
})

describe("runProgrammaticTx — an already-confirmed native send", () => {
    test("carrying a quote is refused, so an echoed quote cannot pass the cap", async () => {
        // A node without node#1174 echoed the transaction's earlier 1 DEM
        // quote at the same height. The signed fee is 2 DEM, the cap 1.5.
        const vd = nativeSendValidityData(OS_FEE, "1000000000")
        const { demos, sign, confirm, broadcast, broadcastAndWait } =
            makeMockDemos(vd)

        await expect(
            runProgrammaticTx(demos, vd, { maxFee: 1.5 }),
        ).rejects.toThrow(
            /already-confirmed native send carries a fee quote .*pass the transaction instead/,
        )
        expect(sign).not.toHaveBeenCalled()
        expect(confirm).not.toHaveBeenCalled()
        expect(broadcast).not.toHaveBeenCalled()
        expect(broadcastAndWait).not.toHaveBeenCalled()
    })

    test("carrying a quote is refused from a thunk and in manual mode", async () => {
        const vd = nativeSendValidityData(OS_FEE, "1000000000")
        const { demos, broadcast } = makeMockDemos(vd)

        await expect(
            runProgrammaticTx(demos, async () => vd, { confirm: "manual" }),
        ).rejects.toThrow(/already-confirmed native send carries a fee quote/)
        expect(broadcast).not.toHaveBeenCalled()
    })

    test("without a quote, the cap is checked on the signed fee", async () => {
        const vd = nativeSendValidityData(OS_FEE)
        const { demos, broadcast } = makeMockDemos(vd)

        expect.assertions(3)
        try {
            await runProgrammaticTx(demos, vd, { maxFee: 1.5 })
        } catch (err) {
            expect(err).toBeInstanceOf(FeeCapExceededError)
            expect((err as FeeCapExceededError).feeOs).toBe(2n * OS_PER_DEM)
        }
        expect(broadcast).not.toHaveBeenCalled()
    })

    test("without a quote, under the cap, broadcasts as before", async () => {
        const vd = nativeSendValidityData(OS_FEE)
        const { demos, confirm, broadcast } = makeMockDemos(vd)

        const result = await runProgrammaticTx(demos, vd, { maxFee: 2.5 })

        expect(confirm).not.toHaveBeenCalled()
        expect(broadcast).toHaveBeenCalledTimes(1)
        expect(result.feeOs).toBe(2n * OS_PER_DEM)
    })

    test("passing its transaction instead uses the quote the runner obtains", async () => {
        // The caller's transaction still carries the earlier quote; the
        // runner removes it, confirms, and trusts the node's fresh quote.
        const tx = {
            ...signedNativeSend(),
            attrs: { reference_block: 42, total_fee: "1000000000" },
        } as unknown as Transaction
        const { demos, confirm, broadcast } = makeMockDemos(
            nativeSendValidityData(OS_FEE, "1000000000"),
        )

        const result = await runProgrammaticTx(demos, tx, { maxFee: 1.5 })

        expect(confirm).toHaveBeenCalledWith({
            ...tx,
            attrs: { reference_block: 42 },
        })
        expect(broadcast).toHaveBeenCalledTimes(1)
        expect(result.feeOs).toBe(1n * OS_PER_DEM)
    })
})

/**
 * A signed native send (fee fields 1 + 1 DEM, in OS) still carrying the
 * 1 DEM quote of an earlier confirmation at block 41.
 */
function previouslyConfirmedSend(): Transaction {
    return {
        hash: "0xabc",
        signature: { type: "ed25519", data: "0xsig" },
        content: {
            type: "native",
            data: SEND_DATA,
            transaction_fee: {
                ...OS_FEE,
                additional_fee: "0",
                rpc_address: null,
            },
        },
        attrs: { reference_block: 41, total_fee: "1000000000" },
    } as unknown as Transaction
}

describe("runProgrammaticTx — a quote from an earlier confirmation", () => {
    test("is removed before the transaction is confirmed again", async () => {
        const tx = previouslyConfirmedSend()
        const { demos, confirm } = makeMockDemos(nativeSendValidityData(OS_FEE))

        await runProgrammaticTx(demos, tx, { confirm: "manual" })

        // Same content, hash and signature; only the unsigned quote is gone.
        expect(confirm).toHaveBeenCalledWith({
            ...tx,
            attrs: { reference_block: 41 },
        })
        // The caller's transaction is left as it was.
        expect(tx.attrs.total_fee).toBe("1000000000")
    })

    test("echoed by an older node, does not pass the cap", async () => {
        // A node without node#1174 echoes the transaction it was sent, here
        // at block 50 where the send charges 3 DEM. The cap is checked on
        // the signed 2 DEM, as on the base runner, and 1.5 DEM refuses it.
        const broadcast = jest.fn()
        const demos = {
            confirm: jest.fn(async (tx: Transaction) => ({
                result: 200,
                require_reply: false,
                extra: null,
                response: {
                    data: {
                        valid: true,
                        reference_block: 50,
                        gas_operation: null,
                        transaction: tx,
                    },
                },
            })),
            broadcast,
        } as unknown as Demos

        expect.assertions(3)
        try {
            await runProgrammaticTx(demos, previouslyConfirmedSend(), {
                maxFee: 1.5,
            })
        } catch (err) {
            expect(err).toBeInstanceOf(FeeCapExceededError)
            expect((err as FeeCapExceededError).feeOs).toBe(2n * OS_PER_DEM)
        }
        expect(broadcast).not.toHaveBeenCalled()
    })
})

describe("runProgrammaticTx — a signed transaction whose attrs is not an object", () => {
    test.each([["x"], [7], [true]])(
        "attrs %p is confirmed unchanged, as on the base runner",
        async attrs => {
            const tx = { ...signedNativeSend(), attrs } as unknown as Transaction
            const vd = nativeSendValidityData(OS_FEE)
            const { demos, confirm, broadcast } = makeMockDemos(vd)

            const result = await runProgrammaticTx(demos, tx, { maxFee: 2.5 })

            expect(confirm).toHaveBeenCalledWith(tx)
            expect(broadcast).toHaveBeenCalledTimes(1)
            expect(result.feeOs).toBe(2n * OS_PER_DEM)
        },
    )
})

/** `vd` with its transaction's `content.type` set to `type`. */
function withType(
    vd: RPCResponseWithValidityData,
    type: string,
): RPCResponseWithValidityData {
    ;(vd.response.data.transaction.content as { type: string }).type = type
    return vd
}

// node#1174 quotes native sends only, so a quote on any other type was not
// made by the node (e.g. one the caller set, echoed by an older node).
describe("a total_fee on a non-native transaction", () => {
    test.each([
        ["string OS", OS_FEE],
        ["number DEM", DEM_FEE],
    ])("is ignored for the summed signed fee (%s)", (_shape, fee) => {
        const vd = withType(nativeSendValidityData(fee, "1"), "escrow")
        expect(totalFeeOs(vd)).toBe(2n * OS_PER_DEM)
    })

    test("does not let already-confirmed validity data pass the cap", async () => {
        // Signed 2 DEM; the 1 OS quote would pass a 1.5 DEM cap.
        const vd = withType(nativeSendValidityData(OS_FEE, "1"), "escrow")
        const { demos, sign, confirm, broadcast } = makeMockDemos(vd)

        expect.assertions(5)
        try {
            await runProgrammaticTx(demos, vd, { maxFee: 1.5 })
        } catch (err) {
            expect(err).toBeInstanceOf(FeeCapExceededError)
            expect((err as FeeCapExceededError).feeOs).toBe(2n * OS_PER_DEM)
        }
        expect(sign).not.toHaveBeenCalled()
        expect(confirm).not.toHaveBeenCalled()
        expect(broadcast).not.toHaveBeenCalled()
    })
})

/** `vd` as a native `operation` (not a send), e.g. `tlsn_request`. */
function withNativeOperation(
    vd: RPCResponseWithValidityData,
    operation: string,
): RPCResponseWithValidityData {
    ;(vd.response.data.transaction.content as { data: unknown }).data = [
        "native",
        { nativeOperation: operation, args: ["https://example.com"] },
    ]
    return vd
}

// node#1174's `isNativeSend` also requires `data[1].nativeOperation` "send",
// so a quote on another native operation was not made by the node either.
describe("a total_fee on a native operation other than send", () => {
    test.each([
        ["tlsn_request", "string OS", OS_FEE],
        ["tlsn_request", "number DEM", DEM_FEE],
        ["tlsn_store", "string OS", OS_FEE],
        ["tlsn_store", "number DEM", DEM_FEE],
    ])("%s is ignored for the summed signed fee (%s)", (op, _shape, fee) => {
        const vd = withNativeOperation(nativeSendValidityData(fee, "1"), op)
        expect(totalFeeOs(vd)).toBe(2n * OS_PER_DEM)
    })

    test("already-confirmed tlsn_request data is not refused and reports the summed fee", async () => {
        const vd = withNativeOperation(
            nativeSendValidityData(OS_FEE, "1"),
            "tlsn_request",
        )
        const { demos, sign, confirm, broadcast } = makeMockDemos(vd)

        const result = await runProgrammaticTx(demos, vd, { maxFee: 2.5 })

        expect(sign).not.toHaveBeenCalled()
        expect(confirm).not.toHaveBeenCalled()
        expect(broadcast).toHaveBeenCalledTimes(1)
        expect(result.feeOs).toBe(2n * OS_PER_DEM)
    })

    test("a tlsn_request confirm response's quote does not pass the cap", async () => {
        // Signed 2 DEM; the 1 OS quote would pass a 1.5 DEM cap.
        const vd = withNativeOperation(
            nativeSendValidityData(OS_FEE, "1"),
            "tlsn_request",
        )
        const tx = {
            ...signedNativeSend(),
            content: vd.response.data.transaction.content,
        } as Transaction
        const { demos, confirm, broadcast } = makeMockDemos(vd)

        expect.assertions(4)
        try {
            await runProgrammaticTx(demos, tx, { maxFee: 1.5 })
        } catch (err) {
            expect(err).toBeInstanceOf(FeeCapExceededError)
            expect((err as FeeCapExceededError).feeOs).toBe(2n * OS_PER_DEM)
        }
        expect(confirm).toHaveBeenCalledTimes(1)
        expect(broadcast).not.toHaveBeenCalled()
    })
})
