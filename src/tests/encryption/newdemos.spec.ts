import { Cryptography } from "@/encryption"
import {
    hexToUint8Array,
    uint8ArrayToHex,
    unifiedCrypto,
} from "@/encryption/unifiedCrypto"
import { Demos, DemosWebAuth } from "@/websdk"
import forge from "node-forge"

describe("New Demos", () => {
    test("should connect to a wallet", async () => {
        const verified = Cryptography.verify(
            "08b4298f20f28a43299b7d736b05d48955ef5dd8409d3853f2972b297dc3996e",
            forge.util.binary.hex.decode(
                "4f9ff0d471e1f1b886deb850c0dd806e247d60b9907ec8bde64b54025650ef0716cfd7a07c0aa611da64ae2a5a5e70f3560f01e232212dd53032ee871623d10e",
            ),
            forge.util.binary.hex.decode(
                "08b4298f20f28a43299b7d736b05d48955ef5dd8409d3853f2972b297dc3996e",
            ),
        )

        const verified2 = await unifiedCrypto.verify({
            algorithm: "ed25519",
            signature: forge.util.binary.hex.decode(
                "4f9ff0d471e1f1b886deb850c0dd806e247d60b9907ec8bde64b54025650ef0716cfd7a07c0aa611da64ae2a5a5e70f3560f01e232212dd53032ee871623d10e",
            ),
            publicKey: forge.util.binary.hex.decode(
                "08b4298f20f28a43299b7d736b05d48955ef5dd8409d3853f2972b297dc3996e",
            ),
            message: forge.util.binary.hex.decode(
                "08b4298f20f28a43299b7d736b05d48955ef5dd8409d3853f2972b297dc3996e",
            ),
        })

        console.log("verified:", verified)
        console.log("verified2:", verified2)

        expect(verified).toEqual(verified2)
    })

    test.only("Stuff", async () => {
        const rpc = "http://localhost:53550"

        const identity = DemosWebAuth.getInstance()
        await identity.login(
            "0x8ef606ad922ae1ce88fa8b245b8dbcff5b5a5ca1b21c594be0c505af6f5317471060ab12b16a7385351fd6ebf0029cc9bcf4dcb2bdb49093368ce4b511f4f1ad",
        )

        const demos = new Demos()
        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey as Uint8Array, {
            algorithm: "falcon",
        })

        const tx = await demos.pay(
            identity.keypair.publicKey.toString("hex"),
            100,
        )
        console.log("tx:", tx)

        const validityData = await demos.confirm(tx)
        console.log("validityData:", validityData)

        expect(validityData.result).toBe(200)

        const result = await demos.broadcast(validityData)
        console.log("result:", result)
    })

    test.skip("signing stuff", async () => {
        const identity = DemosWebAuth.getInstance()
        await identity.login(
            "0x8ef606ad922ae1ce88fa8b245b8dbcff5b5a5ca1b21c594be0c505af6f5317471060ab12b16a7385351fd6ebf0029cc9bcf4dcb2bdb49093368ce4b511f4f1ad",
        )

        const demos = new Demos()
        await demos.connectWallet(identity.keypair.privateKey as Uint8Array, {
            algorithm: "ed25519",
        })

        const publicKey = uint8ArrayToHex(demos.keypair.publicKey)

        const signature = await demos.crypto.sign(
            "ed25519",
            new TextEncoder().encode(publicKey),
        )

        // ===== transform to hex and back =====

        const signature_hex = uint8ArrayToHex(signature.signature)
        const signature_back = hexToUint8Array(signature_hex)

        console.log("signature_hex:", signature_hex)
        console.log("signature_back:", signature_back)

        const publicKey_hex = uint8ArrayToHex(demos.keypair.publicKey)
        const publicKey_back = hexToUint8Array(publicKey_hex)

        console.log("publicKey_hex:", publicKey_hex)
        console.log("publicKey_back:", publicKey_back)
        // ===== end =====

        const verified = await demos.crypto.verify({
            algorithm: "ed25519",
            signature: signature_back,
            publicKey: publicKey_back,
            message: new TextEncoder().encode(publicKey_hex),
        })

        console.log("verified:", verified)
    })
})
