import { NativeBridge } from "@/bridge/nativeBridge"
import { BridgeOperation } from "@/bridge/nativeBridgeTypes"
import { Demos } from "@/websdk"

describe("Native bridge Playground", () => {
    const rpc_url = "http://localhost:53550"
    const demos = new Demos()
    const mnemonic = "green comfort mother science city film option length total alone laptop donor"

    let bridge: NativeBridge

    beforeAll(async () => {
        await demos.connect(rpc_url)
        await demos.connectWallet(mnemonic)

        bridge = new NativeBridge(demos)
    })

    test("Validate native bridge operation", async () => {
        const operation: BridgeOperation = {
            address: await demos.getEd25519Address(),
            from: {
                chain: "evm.eth",
                subchain: "sepolia",
                address: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',
            },
            to: {
                chain: "solana",
                subchain: "devnet",
                address: "J5UG6CP3iSCWVdUgMF51LUwY77tJaHWBRhgGzY546kKx",
            },
            token: {
                amount: "10",
                type: "usdc"
            }
        }

        const compiled = await bridge.validate(operation)
        console.log(compiled)

        const receipt = await bridge.confirm(compiled)
        console.log(receipt)

        const res = await bridge.broadcast(receipt)
        console.log(res)
    })
})