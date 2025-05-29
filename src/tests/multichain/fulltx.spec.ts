import { XRPL, EVM } from "@/multichain/websdk"
import chainProviders from "./chainProviders"
import { wallets } from "../utils/wallets"
import {
    Demos,
    DemosWebAuth,
    prepareXMPayload,
    prepareXMScript,
} from "@/websdk"

describe("DEMOS Transaction", () => {
    test("Classic XM Transaction", async () => {
        const evm = await EVM.create(chainProviders.eth.sepolia)
        await evm.connectWallet(wallets.evm.privateKey)

        // const evm_tx = await evm.preparePay(
        //     "0xda3ea78Af43E6B1c63A08cD0058973F14e5556b0",
        //     "0.000000001",
        // )

        const evm_txs = await evm.preparePays([
            {
                address: "0xda3ea78Af43E6B1c63A08cD0058973F14e5556b0",
                amount: "0.000000001",
            },
            {
                address: "0xda3ea78Af43E6B1c63A08cD0058973F14e5556b0",
                amount: "0.000000001",
            },
        ])

        const balance = await evm.getBalance(evm.getAddress())

        console.log(evm_txs)
        console.log(balance)

        const xmscript = prepareXMScript({
            chain: "eth",
            subchain: "sepolia",
            signedPayloads: [evm_txs[0]],
            type: "pay",
        })

        const identity = DemosWebAuth.getInstance()
        await identity.create()

        const rpc = "http://localhost:53550"

        const demos = new Demos()

        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey as any)

        const tx = await prepareXMPayload(xmscript, demos)

        console.log(xmscript)
        console.log(tx)

        console.log("address", demos.getAddress())
        console.log("private key:", identity.keypair.privateKey.toString("hex"))

        const validityData = await demos.confirm(tx)
        console.log("validityData", validityData)

        const res = await demos.broadcast(validityData)
        console.log("res", res)
    })

    test.only("XRPL Send tokens", async () => {
        // 1. Create XRPL SDK instance
        const sdk = await XRPL.create(chainProviders.xrpl.testnet)
        await sdk.connectWallet(wallets.xrpl.privateKey)

        // 2. Prepare the XRPL payload
        const payload = await sdk.preparePay(
            "rGT8xyrpWTNnTAvAZKsccu5456ArfJ7SMb",
            "1",
        )

        // 3. Prepare the XMScript
        const xmscript = prepareXMScript({
            chain: "xrpl",
            subchain: "testnet",
            signedPayloads: [payload],
            type: "pay",
        })

        // 4. Create the DEMOS identity
        const identity = DemosWebAuth.getInstance()
        await identity.create()

        // const rpc = "https://demosnode.discus.sh"
        const rpc = "http://localhost:53550"
        // const rpc = "https://demos.mungaist.com"
        const demos = new Demos()

        // 5. Connect to the DEMOS node
        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey as any, {
            algorithm: "falcon",
            dual_sign: true,
        })

        // 6. Convert the XMScript to a DEMOS transaction
        const tx = await prepareXMPayload(xmscript, demos)

        // 7. Broadcast the transaction
        const validityData = await demos.confirm(tx)
        console.log("validityData", validityData)

        const res = await demos.broadcast(validityData)
        console.log("res", res)
    })

    test.skip("Web2 Classic Transaction", async () => {})
})
