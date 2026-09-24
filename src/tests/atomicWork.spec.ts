import { GCRGeneration } from "@/websdk/GCRGeneration"

const SENDER = "0x" + "aa".repeat(32)
const TO = "0x" + "bb".repeat(32)

const attempt = { type: "work-attempt", workId: "w1", attemptId: "a1", canonicalBytesHash: "h1" }
const receipt = {
    type: "work-receipt",
    workId: "w1",
    receiptCommitment: "r1",
    effectsRoot: "e1",
    inputHash: "i1",
    outputHash: "o1",
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
            workTx({ edits: [attempt, receipt], transfers: [{ to: TO, amount: "25" }] }),
        )
        expect(edits.map(e => e.type + ((e as any).operation ? ":" + (e as any).operation : ""))).toEqual([
            "work-attempt",
            "balance:remove",
            "balance:add",
            "work-receipt",
            "balance:remove",
            "nonce:add",
        ])
        expect(edits[1]).toMatchObject({ account: SENDER, amount: "25" })
        expect(edits[2]).toMatchObject({ account: TO, amount: "25" })
        expect(edits.every(e => e.txhash === "0xtx")).toBe(true)
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
