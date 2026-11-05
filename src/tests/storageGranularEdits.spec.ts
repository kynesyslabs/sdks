import { StorageProgram } from "@/storage"
import { GCRGeneration, HandleStorageProgramOperations } from "@/websdk/GCRGeneration"
import { Demos } from "@/websdk"
import type { GCREdit } from "@/types"

const SENDER = "0x" + "aa".repeat(32)
const ADDRESS = "stor-" + "ab".repeat(20)

function storageTx(payload: unknown): any {
    return {
        hash: "0xtx",
        content: {
            type: "storageProgram",
            from: SENDER,
            from_ed25519_address: SENDER,
            to: ADDRESS,
            amount: 0,
            nonce: 3,
            data: ["storageProgram", payload],
        },
    }
}

const shape = (edits: GCREdit[]) =>
    edits.map(e => e.type + ((e as any).operation ? ":" + (e as any).operation : ""))

const storageEdit = (edits: GCREdit[]) =>
    edits.find(e => e.type === "storageProgram") as any

describe("GCRGeneration for granular storage operations", () => {
    it.each([
        ["SET_FIELD", StorageProgram.setField(ADDRESS, "n", 2)],
        ["SET_ITEM", StorageProgram.setItem(ADDRESS, "list", 0, "x")],
        ["APPEND_ITEM", StorageProgram.appendItem(ADDRESS, "list", { a: 1 })],
    ])("%s burns a fee and carries the payload", async (operation, payload) => {
        const edits = await GCRGeneration.generate(storageTx(payload))
        expect(shape(edits)).toEqual([
            "balance:remove",
            "storageProgram",
            "balance:remove",
            "nonce:add",
        ])
        expect(edits[0]).toMatchObject({ account: SENDER, amount: 1, txhash: "0xtx" })
        expect(storageEdit(edits)).toEqual({
            type: "storageProgram",
            target: ADDRESS,
            isRollback: false,
            txhash: "0xtx",
            context: {
                operation,
                sender: SENDER,
                data: { variables: payload, metadata: null },
            },
        })
    })

    it.each([
        ["DELETE_FIELD", StorageProgram.deleteField(ADDRESS, "n")],
        ["DELETE_ITEM", StorageProgram.deleteItem(ADDRESS, "list", -1)],
    ])("%s carries the payload and burns no storage fee", async (operation, payload) => {
        const edits = await GCRGeneration.generate(storageTx(payload))
        expect(shape(edits)).toEqual(["storageProgram", "balance:remove", "nonce:add"])
        expect(storageEdit(edits).context).toEqual({
            operation,
            sender: SENDER,
            data: { variables: payload, metadata: null },
        })
    })

    it("prices a write from the field and value, 1 DEM per started 10KB", async () => {
        // {"k":"<v>"} is 8 bytes of framing around the value
        const atLimit = "v".repeat(10240 - 8)
        const over = "v".repeat(10240 - 7)
        const fee = async (payload: unknown) =>
            ((await GCRGeneration.generate(storageTx(payload)))[0] as any).amount

        expect(await fee(StorageProgram.setField(ADDRESS, "k", atLimit))).toBe(1)
        expect(await fee(StorageProgram.setField(ADDRESS, "k", over))).toBe(2)
        // A long field name is stored too, so it is priced too
        expect(await fee(StorageProgram.setField(ADDRESS, "k".repeat(30000), 0))).toBe(3)
        // The array operations are sized as {"k":[<v>]}, two bytes more
        expect(await fee(StorageProgram.appendItem(ADDRESS, "k", atLimit))).toBe(2)
        expect(await fee(StorageProgram.setItem(ADDRESS, "k", 0, "v".repeat(10240 - 10)))).toBe(1)
    })

    it("the footprint bounds the growth of the stored data", () => {
        const size = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length
        const before = { a: [1], b: "x" }
        const cases: [ReturnType<typeof StorageProgram.setField>, Record<string, unknown>][] = [
            [StorageProgram.setField(ADDRESS, "new", { deep: [1, 2] }), { ...before, new: { deep: [1, 2] } }],
            [StorageProgram.appendItem(ADDRESS, "fresh", "item"), { ...before, fresh: ["item"] }],
            [StorageProgram.appendItem(ADDRESS, "a", "item"), { ...before, a: [1, "item"] }],
            [StorageProgram.setItem(ADDRESS, "a", 0, "longer"), { ...before, a: ["longer"] }],
        ]
        for (const [payload, after] of cases) {
            const footprint = HandleStorageProgramOperations.granularWriteFootprint(payload)
            expect(size(footprint)).toBeGreaterThanOrEqual(size(after) - size(before))
        }
    })

    it("is the same edit set after a JSON round trip, as a node regenerates it", async () => {
        const payload = StorageProgram.setField(ADDRESS, "profile", { name: "n", tags: ["a"] })
        const tx = storageTx(payload)
        const authored = await GCRGeneration.generate(tx)
        const wire = JSON.parse(JSON.stringify(tx))
        const regenerated = await GCRGeneration.generate(wire)
        expect(JSON.parse(JSON.stringify(authored))).toEqual(JSON.parse(JSON.stringify(regenerated)))
    })

    it("demos.storagePrograms.sign ships the granular edits", async () => {
        const demos: any = new Demos()
        await demos.connectWalletFromPrivateKey("0x" + "11".repeat(32), { algorithm: "ed25519" })
        demos.getAddressNonce = async () => 4
        demos._isPostForkCached = async () => false
        demos._assertAmountAcceptableOnTargetNode = async () => {}
        demos._getNetworkParametersCached = async () => ({ networkFee: 1, rpcFee: 0 })
        demos._chainIdCached = async () => "devnet"
        demos._isSignatureDomainActiveCached = async () => false

        const signed = await demos.storagePrograms.sign(StorageProgram.setField(ADDRESS, "n", 2))
        const edit = storageEdit(signed.content.gcr_edits)
        expect(edit.context.operation).toBe("SET_FIELD")
        expect(edit.context.data.variables).toMatchObject({ field: "n", value: 2 })
        expect(edit.context.sender).toBe(signed.content.from_ed25519_address)
        expect(shape(signed.content.gcr_edits)[0]).toBe("balance:remove")
    })
})
