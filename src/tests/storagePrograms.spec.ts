import { StorageProgram } from "@/storage"
import { Transaction } from "@/types"
import { Demos, DemosTransactions } from "@/websdk"

describe("Storage Programs", () => {
    const rpc = "http://localhost:53550"

    const nonce = 2
    const programName = "myProgram"

    const mnemonic = process.env.FUNDED_MNEMONIC
    const demos = new Demos()

    beforeAll(async () => {
        if (!mnemonic) {
            console.error("FUNDED_MNEMONIC is not set")
            process.exit(0)
        }

        await demos.connect(rpc)
        await demos.connectWallet(mnemonic)
    })

    test.only("Create Storage Program", async () => {
        const deployerAddress = demos.getAddress()

        const address = StorageProgram.deriveStorageAddress(
            demos.getAddress(),
            programName,
            nonce,
        )
        console.log("Storage Program Address:", address)

        const payload = StorageProgram.createStorageProgram(
            deployerAddress,
            programName,
            {
                poem: "The quick brown fox jumps over the lazy dog",
                number: 42,
                // bigNo: BigInt(1234567890),
                boolean: true,
                array: [1, 2, 3],
                object: {
                    name: "John Doe",
                    age: 30,
                    email: "john.doe@example.com",
                },
                nullValue: null,
                undefinedValue: undefined,
                date: new Date(),
            },
            "json",
            {
                mode: "public",
            },
            {
                nonce,
            },
        )

        const signedTx = await demos.storagePrograms.sign(payload)
        const validityData = await demos.confirm(signedTx)

        const broadcastRes = await demos.broadcast(validityData)
        console.log("Broadcast Result:", broadcastRes)
    })

    test.skip("Read Storage Program", async () => {
        const address = StorageProgram.deriveStorageAddress(
            demos.getAddress(),
            programName,
            nonce,
        )
        const programResult = await demos.storagePrograms.read(address)
        console.log("Data:", programResult)

        expect(programResult.success).toBe(true)

        if (
            programResult.data["poem"] ===
            "The quick brown fox jumps over the lazy dog"
        ) {
            const data = programResult.data
            expect(data["number"]).toBe(42)
            expect(data["boolean"]).toBe(true)
            expect(data["array"]).toEqual([1, 2, 3])
            expect(data["object"]).toEqual({
                name: "John Doe",
                age: 30,
                email: "john.doe@example.com",
            })
            expect(data["nullValue"]).toBeNull()
            expect(data["undefinedValue"]).toBeUndefined()
            expect(data["date"]).toMatch(
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
            )
        } else {
            expect(programResult.data["poem"]).toBe(
                "The quick brown fox never actually jumps over the lazy dog",
            )
        }
    })

    test.skip("Update Storage Program data", async () => {
        const address = StorageProgram.deriveStorageAddress(
            demos.getAddress(),
            programName,
            nonce,
        )

        const new_data = {
            poem: "The quick brown fox never actually jumps over the lazy dog",
        }

        const payload = StorageProgram.writeStorage(address, new_data)
        const signedTx = await demos.storagePrograms.sign(payload)
        const validityData = await demos.confirm(signedTx)

        const broadcastRes = await demos.broadcast(validityData)
        console.log("Broadcast Result:", broadcastRes)

        expect(broadcastRes.result).toBe(200)
    })

    test.skip("Delete Storage Program", async () => {
        const address = StorageProgram.deriveStorageAddress(
            demos.getAddress(),
            programName,
            nonce,
        )

        const payload = StorageProgram.deleteStorageProgram(address)
        const signedTx = await demos.storagePrograms.sign(payload)
        const validityData = await demos.confirm(signedTx)
        const broadcastRes = await demos.broadcast(validityData)

        expect(broadcastRes.result).toBe(200)
    })
})
