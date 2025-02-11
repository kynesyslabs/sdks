import pprint from "@/utils/pprint"
import Wallet from "@/wallet/Wallet"
import { Demos, DemosWebAuth } from "@/websdk"

describe("Native transactions", () => {
    let demos: Demos
    let senderWebAuth: DemosWebAuth
    let recepientWebAuth: DemosWebAuth

    beforeAll(async () => {
        senderWebAuth = DemosWebAuth.getInstance()
        await senderWebAuth.create()

        recepientWebAuth = DemosWebAuth.getInstance()
        await recepientWebAuth.create()

        demos = new Demos()

        await demos.connect("http://localhost:53550")
        await demos.connectWallet(
            senderWebAuth.keypair.privateKey as Uint8Array,
        )
    })

    test("Pay", async () => {
        const wallet = Wallet.getInstance("test")

        // INFO: This will create the tx and confirm it
        const res = await wallet.transfer(
            `0x${recepientWebAuth.keypair.publicKey.toString("hex")}`, // to
            100, // amount
            demos,
        )

        pprint("Tx confirm result", res)
        expect(res.result).toBe(200)

        if (res.result == 200) {
            const broadcastRes = await wallet.broadcast(res, demos)
            pprint("Tx broadcast result", broadcastRes)
        } else {
            pprint("Tx confirm failed", res)
        }
    })
})
