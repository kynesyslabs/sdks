import { EVM } from "@/multichain/websdk"
import chainProviders from "./chainProviders"
import { wallets } from "../utils/wallets"
import {
    demos,
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

        const tx = await prepareXMPayload(xmscript, identity.keypair)

        console.log(xmscript)
        console.log(tx)

        const rpc = "https://mungaist.com"

        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey as any)

        console.log("address", demos.getAddress())
        console.log("private key:", identity.keypair.privateKey.toString("hex"))

        const validityData = await demos.confirm(tx)
        console.log("validityData", validityData)

        const res = await demos.broadcast(validityData, identity.keypair)
        console.log("res", res)
    })

    test.skip("Web2 Classic Transaction", async () => {})
})
