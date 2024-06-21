/* 
  These are generic tests for each chain.
  They make sure all the sdks behave the same way.
*/

import { Client } from "xrpl"
import { TonClient } from "@ton/ton"
import { JsonRpcProvider } from "ethers"
import { Connection } from "@solana/web3.js"
import { StargateClient } from "@cosmjs/stargate"
import { INetworkProvider } from "@multiversx/sdk-network-providers/out/interface"

import chainProviders from "./chainProviders"
import { EVM, IBC, MULTIVERSX, XRPL, SOLANA, TON } from "@/multichain/core"

// INFO: Chains and their RPCs
const chains = [
    {
        name: "EGLD",
        sdk: MULTIVERSX,
        rpc: chainProviders.egld.testnet,
    },
    {
        name: "XRPL",
        sdk: XRPL,
        rpc: chainProviders.xrpl.testnet,
    },
    {
        name: "EVM",
        sdk: EVM,
        rpc: chainProviders.eth.sepolia,
    },
    {
        name: "IBC",
        sdk: IBC,
        rpc: chainProviders.ibc.testnet,
    },
    {
        name: "SOLANA",
        sdk: SOLANA,
        rpc: chainProviders.solana.devnet,
    },
    {
        name: "TON",
        sdk: TON,
        rpc: chainProviders.ton.testnet,
    },
]

// INFO: For loop to test each chain sdk
describe.each(chains)("GENERIC CHAIN TESTS › $name", ({ name, rpc, sdk }) => {
    let instance: IBC | EVM | MULTIVERSX | XRPL | SOLANA | TON

    beforeAll(async () => {
        if (name === "TON") {
            // INFO: The ton rpc url is a Promise<string>
            rpc = await rpc
        }

        // @ts-expect-error
        // Caused by the use of generics to determine the output of sdk.create
        instance = await sdk.create(rpc)
    })

    test("Chain has a valid name", () => {
        expect(instance.name).toBeTruthy()
    })

    test("Testnet RPC is up", async () => {
        const connected = await instance.connect()

        expect(instance.connected).toBe(true)
        expect(connected).toBe(true)

        // INFO: Max timeout for this test
    })

    test("On connect failure, .connected is false", async () => {
        const mock = jest.fn().mockRejectedValue(new Error("mock error"))

        // INFO: Mock the provider method that connects to the RPC to throw an error
        switch (name) {
            case "EVM":
                ;(instance.provider as JsonRpcProvider).getNetwork = mock
                break
            case "IBC":
                ;(instance.provider as StargateClient).getChainId = mock
                break
            case "XRPL":
                ;(instance.provider as Client).connect = mock
                break
            case "EGLD":
                ;(instance.provider as INetworkProvider).getNetworkConfig = mock
                break

            case "SOLANA":
                ;(instance.provider as Connection).getVersion = mock
                break

            case "TON":
                ;(instance.provider as TonClient).getMasterchainInfo = mock
                break

            default:
                expect(true).toBe(false)
        }

        let isConnected: boolean

        switch (name) {
            case "IBC":
                isConnected = await (instance as IBC).connect(instance.rpc_url)
                break
            case "XRPL":
                // @ts-expect-error
                // XRPL connect methods accepts a "with_reconnect" parameter
                isConnected = await instance.connect(false)
                break

            default:
                isConnected = await instance.connect()
        }

        expect(isConnected).toBe(false)
    })

    test("On disconnect, provider is reset", async () => {
        // INFO: Disconnecting allows us to exit tests without
        // leaving open handles for web socket providers (eg. XRPL)
        await instance.disconnect()

        expect(instance.connected).toBe(false)
        expect(instance.provider).toBe(null)
        expect(instance.wallet).toBe(null)
    })
})
