jest.mock("@/websdk/programmatic", () => ({
    createProgrammaticTx: jest.fn(() => ({})),
}))

import { Cryptography } from "@/encryption/Cryptography"
import { GCRGeneration } from "@/websdk/GCRGeneration"
import { DemosTransactions } from "@/websdk/DemosTransactions"
import { Demos } from "@/websdk/demosclass"
import { StorageProgram } from "@/storage"

function externalSigner(seedByte: number, allowedTransactionTypes = ["storageProgram"] as const) {
    const keypair = Cryptography.newFromSeed(new Uint8Array(32).fill(seedByte))
    return {
        publicKey: new Uint8Array(keypair.publicKey),
        allowedTransactionTypes,
        sign: jest.fn(async (message: Uint8Array) =>
            new Uint8Array(
                Cryptography.sign(
                    new TextDecoder().decode(message),
                    keypair.privateKey,
                ),
            ),
        ),
    }
}

function storageTransaction() {
    const transaction = DemosTransactions.empty()
    transaction.content.type = "storageProgram"
    transaction.content.to = `stor-${"a".repeat(40)}`
    transaction.content.nonce = 1
    transaction.content.data = [
        "storageProgram",
        StorageProgram.writeStorage(transaction.content.to, { value: "exact" }),
    ]
    return transaction
}

function stubSigningPipeline(demos: Demos) {
    jest.spyOn(GCRGeneration, "generate").mockResolvedValue([])
    ;(demos as any)._getNetworkParametersCached = async () => null
    ;(demos as any)._isPostForkCached = async () => false
    ;(demos as any)._calculateAndApplyGasFee = (transaction: unknown) => transaction
}

describe("external Ed25519 transaction signer", () => {
    afterEach(() => jest.restoreAllMocks())

    test("signs the exact SDK-produced hash without connecting a raw-key wallet", async () => {
        const demos = new Demos()
        const signer = externalSigner(7)
        const address = demos.connectExternalEd25519Signer(signer)
        stubSigningPipeline(demos)

        const signed = await demos.sign(storageTransaction())

        expect(demos.walletConnected).toBe(false)
        expect(demos.getAddress()).toBe(address)
        expect(signer.sign).toHaveBeenCalledTimes(1)
        expect(Buffer.from(signer.sign.mock.calls[0]![0]).toString("utf8"))
            .toBe(signed.hash)
        expect(signed.content.from).toBe(address)
        expect(signed.content.from_ed25519_address).toBe(address)
        expect(signed.signature).toEqual({
            type: "ed25519",
            data: expect.stringMatching(/^0x[0-9a-f]{128}$/),
        })
    })

    test("routes storagePrograms.sign through the same external signer", async () => {
        const demos = new Demos()
        const signer = externalSigner(8)
        demos.connectExternalEd25519Signer(signer)
        stubSigningPipeline(demos)
        jest.spyOn(demos, "getAddressNonce").mockResolvedValue(4)
        const payload = StorageProgram.createStorageProgram(
            demos.getAddress(),
            "external-signer-test",
            { value: "exact" },
            "json",
            StorageProgram.publicACL(),
            { nonce: 5, salt: "" },
        )

        const signed = await demos.storagePrograms.sign(payload)

        expect(signer.sign).toHaveBeenCalledTimes(1)
        expect(signed.content.type).toBe("storageProgram")
        expect(signed.content.nonce).toBe(5)
    })

    test("rejects unadmitted transaction types before invoking the signer", async () => {
        const demos = new Demos()
        const signer = externalSigner(9)
        demos.connectExternalEd25519Signer(signer)
        stubSigningPipeline(demos)
        const transaction = storageTransaction()
        transaction.content.type = "native"
        transaction.content.to = `0x${"b".repeat(64)}`

        await expect(demos.sign(transaction)).rejects.toThrow(/not admitted/)
        expect(signer.sign).not.toHaveBeenCalled()
    })

    test("rejects sender-address substitution before invoking the signer", async () => {
        const demos = new Demos()
        const signer = externalSigner(18)
        demos.connectExternalEd25519Signer(signer)
        stubSigningPipeline(demos)

        const fromSubstitution = storageTransaction()
        fromSubstitution.content.from = `0x${"b".repeat(64)}`
        await expect(demos.sign(fromSubstitution)).rejects.toThrow(/sender/)

        const ed25519Substitution = storageTransaction()
        ed25519Substitution.content.from_ed25519_address = `0x${"c".repeat(64)}`
        await expect(demos.sign(ed25519Substitution)).rejects.toThrow(/Ed25519 address/)
        expect(signer.sign).not.toHaveBeenCalled()
    })

    test("rejects a substituted or malformed signature", async () => {
        const wrong = externalSigner(10)
        const demos = new Demos()
        demos.connectExternalEd25519Signer({
            ...externalSigner(11),
            sign: wrong.sign,
        })
        stubSigningPipeline(demos)
        await expect(demos.sign(storageTransaction())).rejects.toThrow(/signature/)

        const malformed = new Demos()
        malformed.connectExternalEd25519Signer({
            ...externalSigner(12),
            sign: async () => new Uint8Array(63),
        })
        stubSigningPipeline(malformed)
        await expect(malformed.sign(storageTransaction())).rejects.toThrow(/64-byte/)
    })

    test("rejects callback mutation of the admitted hash bytes", async () => {
        const demos = new Demos()
        demos.connectExternalEd25519Signer({
            ...externalSigner(13),
            sign: async (message) => {
                message[0] ^= 0xff
                return new Uint8Array(64)
            },
        })
        stubSigningPipeline(demos)

        await expect(demos.sign(storageTransaction())).rejects.toThrow(/mutated/)
    })

    test("propagates signer callback failures without producing a signature", async () => {
        const demos = new Demos()
        demos.connectExternalEd25519Signer({
            ...externalSigner(19),
            sign: async () => {
                throw new Error("provider unavailable")
            },
        })
        stubSigningPipeline(demos)

        await expect(demos.sign(storageTransaction())).rejects.toThrow(
            "provider unavailable",
        )
    })

    test("preserves a stateful signer callback receiver", async () => {
        const stateful = externalSigner(20) as ReturnType<typeof externalSigner> & {
            calls: number
        }
        stateful.calls = 0
        const originalSign = stateful.sign
        stateful.sign = jest.fn(async function (message: Uint8Array) {
            this.calls += 1
            return originalSign(message)
        })
        const demos = new Demos()
        demos.connectExternalEd25519Signer(stateful)
        stubSigningPipeline(demos)

        await demos.sign(storageTransaction())

        expect(stateful.calls).toBe(1)
    })

    test("revalidates type after asynchronous transaction processing", async () => {
        const demos = new Demos()
        const signer = externalSigner(21)
        demos.connectExternalEd25519Signer(signer)
        ;(demos as any)._getNetworkParametersCached = async () => null
        ;(demos as any)._isPostForkCached = async () => false
        ;(demos as any)._calculateAndApplyGasFee = (transaction: unknown) => transaction

        let releaseGcr: (edits: []) => void
        let gcrEntered: (() => void) | undefined
        const entered = new Promise<void>(resolve => {
            gcrEntered = resolve
        })
        jest.spyOn(GCRGeneration, "generate").mockImplementation(
            () => new Promise(resolve => {
                releaseGcr = resolve
                gcrEntered!()
            }),
        )
        const transaction = storageTransaction()
        const signing = demos.sign(transaction)
        await entered
        transaction.content.type = "native"
        transaction.content.to = `0x${"d".repeat(64)}`
        releaseGcr!([])

        await expect(signing).rejects.toThrow(/not admitted/)
        expect(signer.sign).not.toHaveBeenCalled()
    })

    test("returns only canonical content when the caller mutates during signing", async () => {
        const demos = new Demos()
        const signer = externalSigner(22)
        let releaseSigner: (() => void) | undefined
        let signerEntered: (() => void) | undefined
        const entered = new Promise<void>(resolve => {
            signerEntered = resolve
        })
        const release = new Promise<void>(resolve => {
            releaseSigner = resolve
        })
        const originalSign = signer.sign
        signer.sign = jest.fn(async (message: Uint8Array) => {
            signerEntered!()
            await release
            return originalSign(message)
        })
        demos.connectExternalEd25519Signer(signer)
        stubSigningPipeline(demos)
        const transaction = storageTransaction()
        const signing = demos.sign(transaction)
        await entered

        transaction.content.type = "native"
        transaction.content.from = `0x${"e".repeat(64)}`
        transaction.content.from_ed25519_address = `0x${"f".repeat(64)}`
        releaseSigner!()
        const signed = await signing

        expect(signed.content.type).toBe("storageProgram")
        expect(signed.content.from).toBe(demos.getAddress())
        expect(signed.content.from_ed25519_address).toBe(demos.getAddress())
        expect(
            Cryptography.verify(
                signed.hash,
                Buffer.from(signed.signature!.data.slice(2), "hex"),
                signer.publicKey,
            ),
        ).toBe(true)
    })

    test("binds one immutable public identity and validates configuration", async () => {
        const demos = new Demos()
        expect(() => demos.connectExternalEd25519Signer({
            ...externalSigner(14),
            publicKey: new Uint8Array(31),
        })).toThrow(/32-byte/)
        expect(() => demos.connectExternalEd25519Signer({
            ...externalSigner(14),
            allowedTransactionTypes: [] as const,
        })).toThrow(/non-empty/)
        expect(() => demos.connectExternalEd25519Signer({
            ...externalSigner(14),
            allowedTransactionTypes: ["not-a-transaction"] as any,
        })).toThrow(/Invalid external signer transaction type/)

        const signer = externalSigner(14)
        demos.connectExternalEd25519Signer(signer)
        signer.publicKey.fill(0)
        expect(demos.getAddress()).not.toBe(`0x${"00".repeat(32)}`)
        expect(() => demos.connectExternalEd25519Signer(externalSigner(15)))
            .toThrow(/already connected/)
        await expect(demos.connectWallet(demos.newMnemonic()))
            .rejects.toThrow(/external signer/)
    })

    test("keeps concurrent instances bound to their own signer", async () => {
        const demosA = new Demos()
        const demosB = new Demos()
        const signerA = externalSigner(16)
        const signerB = externalSigner(17)
        demosA.connectExternalEd25519Signer(signerA)
        demosB.connectExternalEd25519Signer(signerB)
        stubSigningPipeline(demosA)
        stubSigningPipeline(demosB)

        const [signedA, signedB] = await Promise.all([
            demosA.sign(storageTransaction()),
            demosB.sign(storageTransaction()),
        ])

        expect(signedA.content.from).toBe(demosA.getAddress())
        expect(signedB.content.from).toBe(demosB.getAddress())
        expect(signedA.content.from).not.toBe(signedB.content.from)
        expect(signedA.signature?.data).not.toBe(signedB.signature?.data)
    })
})
