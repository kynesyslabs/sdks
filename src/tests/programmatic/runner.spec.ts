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
        expect(sign).toHaveBeenCalledWith(unsignedTx)
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
})
