import pprint from "@/utils/pprint"
import Wallet from "@/wallet/Wallet"
import { Demos, DemosTransactions, DemosWebAuth } from "@/websdk"

describe("Native transactions", () => {
    let demos: Demos = new Demos()
    let senderWebAuth = new DemosWebAuth()
    let recepientWebAuth = new DemosWebAuth()

    beforeAll(async () => {
        // NOTE: Replace with funded account on PROD
        // await senderWebAuth.login(<private key>)
        await senderWebAuth.login(
            "0x874626ac0c81016405fb0dcda1007361138e927262e0f21abc771eddc8b2502fccc6ba0c609435a05fdbf236e7df7d60f024ed26c19d8f64b024e6163036247a",
        )
        await recepientWebAuth.create()

        await demos.connect("https://demos.mungaist.com")
        await demos.connectWallet(
            senderWebAuth.keypair.privateKey as Uint8Array,
        )
    })

    test("Pay", async () => {
        const tx = await demos.transfer(
            "0x6690580a02d2da2fefa86e414e92a1146ad5357fd71d594cc561776576857ac5",
            100,
        )

        const res = await demos.confirm(tx)
        pprint("Tx confirm result", res)

        if (res.result == 200) {
            const broadcastRes = await demos.broadcast(res)
            pprint("Tx broadcast result", broadcastRes)
        } else {
            pprint("Tx confirm failed", res)
        }
    })

    test.only("Full Native Transaction", async () => {
        // 1. Initialize the demos instance
        const rpc = "https://demosnode.discus.sh"
        const demos = new Demos()
        await demos.connect(rpc)

        const identity = DemosWebAuth.getInstance()
        await identity.create()
        await demos.connectWallet(identity.keypair.privateKey as Uint8Array)

        // 2. Create a transaction
        const tx = await demos.transfer(
            "0x6690580a02d2da2fefa86e414e92a1146ad5357fd71d594cc561776576857ac5",
            100,
        )

        // 3. Confirm the transaction
        const validityData = await demos.confirm(tx)
        console.log("Validity data", validityData)

        // 4. Broadcast the transaction
        if (validityData.result == 200) {
            const broadcastRes = await demos.broadcast(validityData)
            console.log("Broadcast result", broadcastRes)
        } else {
            console.log("Tx confirm failed", validityData)
        }
    })
})
