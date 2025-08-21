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
                chain: "evm.polygon",
                subchain: "amoy",
                address: "0x5FbE74A283f7954f10AA04C2eDf55578811aeb03",
            },
            token: {
                amount: "10",
                type: "usdc"
            }
        }

        // Validates the operation params (locally), then sends to the node
        const compiled = await bridge.validate(operation)
        console.log("compiled", JSON.stringify(compiled, null, 2))

        // Confirms the compiled operation's signature, creates a tx and sends it
        // to the node using demos.confirm
        const validityData = await bridge.confirm(compiled)
        console.log(validityData)

        // Broadcasts the tx to the node (same as demos.broadcast)
        const res = await bridge.broadcast(validityData)
        console.log(res)
    })
})


