import pprint from "@/utils/pprint"
import { Demos, DemosWebAuth } from "@/websdk"
import axios from "axios"

describe("Native transactions", () => {
    const RPC = "https://demos.mungaist.com"

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

        await demos.connect(RPC)
        await demos.connectWallet(
            senderWebAuth.keypair.privateKey as Uint8Array,
        )
    })

    test.skip("Pay", async () => {
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

    test.only("Node transaction Spam test", async () => {
        // NOTE: To increase the number of concurrent transactions, 
        // run multiple instances of this test at the same time.

        // INFO: Local testnet RPCs
        const rpcs = [
            "http://localhost:53550",
            // "http://localhost:53559",
            // "http://localhost:53560",
        ]

        // INFO: Private testnet RPCs
        // const rpcs = [
        //     "https://demos.mungaist.com",
        //     "http://node2.demos.sh:53560",
        //     "http://node3.demos.sh:53560",
        // ]

        const demoss = rpcs.map(async rpc => {
            const demos = new Demos()
            await demos.connect(rpc)
            return demos
        })

        const mademos = await Promise.all(demoss)

        async function sendTx(demos: Demos) {
            const sender = DemosWebAuth.getInstance()

            await sender.create()
            await demos.connectWallet(sender.keypair.privateKey as Uint8Array)

            const receiver = DemosWebAuth.getInstance()
            await receiver.create()

            const tx = await demos.transfer(
                receiver.keypair.publicKey.toString("hex"),
                100,
            )

            const validityData = await demos.confirm(tx)

            if (validityData.result == 200) {
                const broadcastRes = await demos.broadcast(validityData)
                console.log("Broadcast result", broadcastRes)
            } else {
                console.log("Tx confirm failed", validityData)
            }
        }

        const TXCOUNT = 3

        // 2. Create a transaction
        for (let i = 0; i < TXCOUNT; i++) {
            for (const demos of mademos) {
                await sendTx(demos)
            }
        }

        // 4. Broadcast the transaction
    }, 10000000)
})
