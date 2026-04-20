import pprint from "@/utils/pprint"
import { Identities } from "@/abstraction"
import { Demos, DemosWebAuth, hexToUint8Array } from "@/websdk"
import { sleep } from "@/utils"

describe("Native transactions", () => {
    const rpcs = [
        //  NOTE: Local testnet RPCs
        "http://localhost:53550",
        // "http://localhost:53552",
        "http://localhost:53554",
        //
        // "https://node2.demos.sh",
        // "https://node3.demos.sh",
        //
        //  NOTE: Testnet RPCs
        // "http://node2.demos.sh:53560",
        // "http://node3.demos.sh:53560",
        // "http://node2.demos.sh:53562",
        // "http://node3.demos.sh:53562",
        //
        //  NOTE: Fixnet RPCs
        // "http://node2.demos.sh:60001",
        // "http://node3.demos.sh:60001",
        // "http://node3.demos.sh:20002",
        // "http://mungaist.com:60001",
        // "http://65.7.20.194:53550",
        // "http://5.189.144.254:53550",
        // "http://107.131.170.202:53550",
        // "http://84.32.22.26:53550"
    ]
    const RPC = rpcs[0]

    let demos: Demos = new Demos()
    let senderWebAuth = new DemosWebAuth()
    let recepientWebAuth = new DemosWebAuth()

    const mnemonic = process.env.FUNDED_MNEMONIC

    if (!mnemonic) {
        console.error("FUNDED_MNEMONIC is not set")
        process.exit(0)
    }

    beforeAll(async () => {
        // NOTE: Replace with funded account on PROD
        // await senderWebAuth.login(<private key>)
        await senderWebAuth.login(
            "0x874626ac0c81016405fb0dcda1007361138e927262e0f21abc771eddc8b2502fccc6ba0c609435a05fdbf236e7df7d60f024ed26c19d8f64b024e6163036247a",
        )
        await recepientWebAuth.create()

        await demos.connect(RPC)
        await demos.connectWallet(mnemonic)
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

    test.only("Node transaction Spam test", async () => {
        // NOTE: To increase the number of concurrent transactions,
        // run multiple instances of this test at the same time.

        const demoss = rpcs.map(async rpc => {
            const demos = new Demos()
            await demos.connect(rpc)
            return demos
        })

        const mademos = await Promise.all(demoss)

        async function sendTx(demos: Demos) {
            await demos.connectWallet(
                "sausage audit iron upper jazz dignity cliff size donate nature during ranch vote spot tourist crash police canoe dawn wild gossip transfer plastic view",
            )

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

        const TXCOUNT = 1000
        const BATCH_SIZE = 10
        const BATCHES = Math.ceil(TXCOUNT / BATCH_SIZE)

        for (let batch = 0; batch < BATCHES; batch++) {
            const promises: Promise<void>[] = []
            for (let i = 0; i < BATCH_SIZE; i++) {
                const txIndex = batch * BATCH_SIZE + i
                if (txIndex >= TXCOUNT) break
                const randomDemos =
                    mademos[Math.floor(Math.random() * mademos.length)]
                promises.push(
                    (async () => {
                        try {
                            await sendTx(randomDemos)
                        } catch (err) {
                            console.error("Error in sendTx", err)
                        }
                    })(),
                )
            }
            await Promise.all(promises)
            await sleep(10)
        }

        // 2. Create a transaction
        // for (let i = 0; i < TXCOUNT; i++) {
        //     const randomDemos =
        //         mademos[Math.floor(Math.random() * mademos.length)]
        //     // await sleep(10)
        //     await sendTx(randomDemos)
        // }

        // 4. Broadcast the transaction
    }, 10000000)

    test.skip("Get account by web2 identity", async () => {
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

    test.skip("Get account by web3 identity", async () => {
        const identities = new Identities()
        const identity = await identities.getDemosIdsByWeb3Identity(
            demos,
            "eth.mainnet",
            "0x4e32e615f6a01affda8ba038fe2df911f15dcfc7",
        )

        console.log("identity: ", identity)
    })

    test.skip("Storage transaction test", async () => {
        const tx = await demos.store(hexToUint8Array(demos.getAddress()))
        const validityData = await demos.confirm(tx)
        const broadcastRes = await demos.broadcast(validityData)
        console.log("Broadcast result", broadcastRes)
    })
})
