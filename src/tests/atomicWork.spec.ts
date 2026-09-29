import { Demos } from "@/websdk"
import { GCRGeneration } from "@/websdk/GCRGeneration"
import { DemosTransactions } from "@/websdk/DemosTransactions"
import {
    isTransactionType,
    type AtomicWorkPayload,
    type AtomicWorkTransaction,
    type GCREditStoragePut,
} from "@/types"

const SENDER = "0x" + "aa".repeat(32)
const TO = "0x" + "bb".repeat(32)

const attempt = { type: "work-attempt", workId: "w1", attemptId: "a1", canonicalBytesHash: "h1" }
const slot = {
    type: "resource-slot-cas",
    resourceKey: "k1",
    expected: { state: "vacant", generation: 0 },
    transition: "settle",
    workId: "w1",
    conflictDigest: "c1",
}

function workTx(payload: unknown): any {
    return {
        hash: "0xtx",
        content: {
            type: "atomicWork",
            from: SENDER,
            from_ed25519_address: SENDER,
            to: SENDER,
            amount: 0,
            nonce: 1,
            data: ["atomicWork", payload],
        },
    }
}

describe("GCRGeneration for atomicWork", () => {
    it("emits the Work edits in order with the transfers after the attempt", async () => {
        const edits = await GCRGeneration.generate(
            workTx({ edits: [attempt, slot], transfers: [{ to: TO, amount: "25" }] }),
        )
        expect(edits.map(e => e.type + ((e as any).operation ? ":" + (e as any).operation : ""))).toEqual([
            "work-attempt",
            "balance:remove",
            "balance:add",
            "resource-slot-cas",
            "balance:remove",
            "nonce:add",
        ])
        expect(edits[1]).toMatchObject({ account: SENDER, amount: "25" })
        expect(edits[2]).toMatchObject({ account: TO, amount: "25" })
        expect(edits.every(e => e.txhash === "0xtx")).toBe(true)
    })

    it("refuses a receipt from the sender: the node builds it", async () => {
        await expect(
            GCRGeneration.generate(workTx({ edits: [attempt, { type: "work-receipt", workId: "w1" }] })),
        ).rejects.toThrow("not a Work edit")
    })

    it("refuses anything that is not a Work edit in the payload", async () => {
        await expect(
            GCRGeneration.generate(
                workTx({ edits: [attempt, { type: "balance", operation: "add", account: SENDER, amount: 1 }] }),
            ),
        ).rejects.toThrow("not a Work edit")
    })

    it("refuses an empty Work and a malformed transfer", async () => {
        await expect(GCRGeneration.generate(workTx({ edits: [] }))).rejects.toThrow("non-empty")
        await expect(
            GCRGeneration.generate(workTx({ edits: [attempt], transfers: [{ to: TO, amount: "-1" }] })),
        ).rejects.toThrow("positive integer")
    })
})

describe("atomicWork edits the node cannot apply are refused", () => {
    it("refuses a transfer to something that is not an account address", async () => {
        for (const to of ["not-an-address", "bb".repeat(32), "0x" + "bb".repeat(20), "0x" + "zz".repeat(32)]) {
            await expect(
                GCRGeneration.generate(workTx({ edits: [attempt], transfers: [{ to, amount: "1" }] })),
            ).rejects.toThrow("32-byte hex address")
        }
    })

    it("requires the Work to start with its attempt", async () => {
        await expect(GCRGeneration.generate(workTx({ edits: [slot, attempt] }))).rejects.toThrow(
            "start with its work-attempt",
        )
        await expect(
            GCRGeneration.generate(workTx({ edits: [slot], transfers: [{ to: TO, amount: "1" }] })),
        ).rejects.toThrow("start with its work-attempt")
    })
})

describe("DemosTransactions.atomicWork", () => {
    async function demosOn(postFork: boolean): Promise<Demos> {
        const demos = new Demos()
        ;(demos as any).nodeCall = async (message: string) => {
            if (message === "getNetworkInfo")
                return {
                    forks: {
                        osDenomination: { activated: postFork, activationHeight: 1, currentHeight: 10 },
                    },
                }
            if (message === "getAddressNonce") return 4
            return null
        }
        ;(demos as any)._getNetworkParametersCached = async () => null
        await demos.connectWallet(demos.newMnemonic())
        return demos
    }

    const payload: AtomicWorkPayload = {
        intent: { profile: "p" },
        edits: [attempt as AtomicWorkPayload["edits"][number]],
        transfers: [{ to: TO, amount: "1500000001" }],
    }

    it("signs a Work whose transfer amounts survive as OS strings", async () => {
        const tx = await DemosTransactions.atomicWork(payload, await demosOn(true))

        expect(tx.content.type).toBe("atomicWork")
        expect(tx.content.nonce).toBe(5)
        expect(tx.signature?.data).toBeTruthy()
        const credit = tx.content.gcr_edits.find(
            (e: any) => e.type === "balance" && e.operation === "add",
        ) as any
        expect(credit).toMatchObject({ account: TO, amount: "1500000001" })
    })

    it("refuses to sign against a node before the osDenomination fork", async () => {
        await expect(DemosTransactions.atomicWork(payload, await demosOn(false))).rejects.toThrow(
            "past the osDenomination fork",
        )
    })

    it("is part of the transaction union the type guard accepts", async () => {
        const tx = await DemosTransactions.atomicWork(payload, await demosOn(true))
        expect(isTransactionType<AtomicWorkTransaction>(tx as any, "atomicWork")).toBe(true)
    })
})

describe("GCREditStoragePut", () => {
    it("ties a prior digest to compare-and-set in the type", () => {
        const base = {
            type: "storage-program-put" as const,
            isRollback: false,
            txhash: "0xtx",
            target: "stor-1",
            writer: SENDER,
            name: "n",
            discriminator: "d",
            valueDigest: "v",
            value: 1,
        }
        const create: GCREditStoragePut = { ...base, mode: "create-only" }
        const cas: GCREditStoragePut = { ...base, mode: "compare-and-set", expectedPriorDigest: "p" }
        // @ts-expect-error compare-and-set without the digest it replaces
        const missing: GCREditStoragePut = { ...base, mode: "compare-and-set" }
        expect([create.mode, cas.mode, missing.mode]).toEqual(["create-only", "compare-and-set", "compare-and-set"])
    })
})
