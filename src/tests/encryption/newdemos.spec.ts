import { Cryptography } from "@/encryption"
import { unifiedCrypto } from "@/encryption/unifiedCrypto"
import { Demos, DemosWebAuth } from "@/websdk"
import forge from "node-forge"

describe("New Demos", () => {
    test("should connect to a wallet", async () => {
        const verified = Cryptography.verify(
            "d2fa5e1139919c6846fea38ffa208a9dedbdfa97b948eebc338078150efba9b3",
            forge.util.binary.hex.decode(
                "1158ed37d9f3510819aa3e424316cd4760c34a94c815d9491eba5e6e601c7c72d81e1cfa8032eeeee2c29d8b13b16f2b6f9f1642946a48cc775adb20fc92780e",
            ),
            forge.util.binary.hex.decode(
                "d2fa5e1139919c6846fea38ffa208a9dedbdfa97b948eebc338078150efba9b3",
            ),
        )

        const verified2 = await unifiedCrypto.verify({
            algorithm: "ed25519",
            signature: forge.util.binary.hex.decode(
                "1158ed37d9f3510819aa3e424316cd4760c34a94c815d9491eba5e6e601c7c72d81e1cfa8032eeeee2c29d8b13b16f2b6f9f1642946a48cc775adb20fc92780e",
            ),
            publicKey: forge.util.binary.hex.decode(
                "d2fa5e1139919c6846fea38ffa208a9dedbdfa97b948eebc338078150efba9b3",
            ),
            message: forge.util.binary.hex.decode(
                "d2fa5e1139919c6846fea38ffa208a9dedbdfa97b948eebc338078150efba9b3",
            ),
        })
        console.log("verified:", verified)
        console.log("verified2:", verified2)

        expect(verified).toEqual(verified2)
    })

    test.only("Stuff", async () => {
        const rpc = "http://localhost:53550"

        const identity = DemosWebAuth.getInstance()
        await identity.create()

        console.log(
            "identity.keypair.privateKey:",
            identity.keypair.privateKey.length,
        )

        const demos = new Demos()
        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey as Uint8Array)

        const tx = await demos.pay(
            identity.keypair.publicKey.toString("hex"),
            100,
        )
        console.log("tx:", tx)

        const validityData = await demos.confirm(tx)
        console.log("validityData:", validityData)
    })
})
