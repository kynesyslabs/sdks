import pprint from "@/utils/pprint"
import { Identities } from "@/abstraction"
import { Demos, DemosWebAuth } from "@/websdk"

describe("Native transactions", () => {
    // const RPC = "https://demos.mungaist.com"
    const RPC = "http://localhost:53550"

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
            {
                algorithm: "falcon"
            }
        )
    })

    test.skip("Pay", async () => {
        const tx = await demos.pay(
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

    test.skip("Node transaction Spam test", async () => {
        // NOTE: To increase the number of concurrent transactions, 
        // run multiple instances of this test at the same time.

        // INFO: Local testnet RPCs
        // const rpcs = [
        //     "http://localhost:53550",
        //     "http://localhost:53559",
        //     "http://localhost:53560",
        // ]

        // INFO: Private testnet RPCs
        // const rpcs = [
        //     "https://demos.mungaist.com",
        //     "http://node2.demos.sh:53560",
        //     "http://node3.demos.sh:53560",
        // ]

        // INFO: Public testnet RPCs
        const rpcs = [
            "https://demosnode.discus.sh",
            "http://mungaist.com:53550",
        ]

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

    test.only("Get account by web2 identity", async () => {
        const identities = new Identities()
        const identity = await identities.getDemosIdsByIdentity(demos, {
            type: "web2",
            // @ts-ignore
            context: "unknown",
            username: "gokusonwae",
            userId: undefined,
        })

        console.log("identity: ", identity)
    })

    test.only("Get account by web3 identity", async () => {
        const identities = new Identities()
        const identity = await identities.getDemosIdsByWeb3Identity(demos, "eth.mainnet", "0x4e32e615f6a01affda8ba038fe2df911f15dcfc7")

        console.log("identity: ", identity)
    })
})
