import { InferFromSignaturePayload } from "@/abstraction"
import Identities from "@/abstraction/Identities"
import {
    EVM,
    IBC,
    MULTIVERSX,
    SOLANA,
    TON,
    XRPL,
    NEAR,
} from "@/multichain/websdk"
import { DemosWebAuth } from "@/websdk"
import { Demos } from "@/websdk/demosclass"
import { wallets } from "../utils/wallets"
import {
    InferFromSignatureTargetIdentityPayload,
    RemoveIdentityPayload,
} from "@/types/abstraction"

const chains = [
    {
        name: "EVM",
        sdk: EVM,
        subchain: "sepolia",
        wallet: wallets.evm.privateKey,
    },
    {
        name: "SOLANA",
        sdk: SOLANA,
        subchain: "testnet",
        wallet: wallets.solana.privateKey,
    },
    // {
    //     name: "EGLD",
    //     sdk: MULTIVERSX,
    //     rpc: chainProviders.egld.testnet,
    //     wallet: wallets.egld.privateKey,
    // },
    // {
    //     name: "XRPL",
    //     sdk: XRPL,
    //     rpc: chainProviders.xrpl.testnet,
    //     wallet: wallets.xrpl.privateKey,
    // },
    // {
    //     name: "IBC",
    //     sdk: IBC,
    //     rpc: chainProviders.ibc.testnet,
    //     wallet: wallets.ibc.privateKey,
    // },
    // {
    //     name: "TON",
    //     sdk: TON,
    //     rpc: chainProviders.ton.testnet,
    //     wallet: wallets.ton.privateKey,
    // },
    // {
    //     name: "NEAR",
    //     sdk: NEAR,
    //     rpc: chainProviders.near.testnet,
    //     wallet: wallets.near.privateKey,
    // },
]

describe.each(chains)(
    "Identities › $name",
    ({ name, sdk, wallet, subchain }: any) => {
        let instance: any

        const demos: Demos = new Demos()
        const identities: Identities = new Identities()
        const identity: DemosWebAuth = DemosWebAuth.getInstance()

        beforeAll(async () => {
            await identity.create()

            await demos.connect("http://localhost:53550")
            await demos.connectWallet(
                "0x2befb9016e8a39a6177fe8af8624c763da1a6f51b0e7c6ebc58d62749c5c68d55a6f62c7335deb2672a6217c7594c7af9f0fae0e84358673ba268f6901287928",
            )

            instance = await sdk.create(null)
            await instance.connectWallet(wallet)
        })

        test("Associate an identity using a signature", async () => {
            const instance = await sdk.create(null)
            await instance.connectWallet(wallet)

            // INFO: Create the target_identity payload
            const _signature = await instance.signMessage(instance.getAddress())
            const target_identity: InferFromSignatureTargetIdentityPayload = {
                chain: instance.name,
                subchain: subchain,
                signature: _signature,
                signedData: instance.getAddress(),
                targetAddress: instance.getAddress(),
                isEVM: name === "EVM",
                chainId: instance.chainId,
            }

            // INFO: Verify the message locally
            const verified = await instance.verifyMessage(
                instance.getAddress(),
                _signature,
                instance.getAddress(),
            )

            // INFO: Make sure the message is verifiable
            expect(verified).toBe(true)

            const payload: InferFromSignaturePayload = {
                method: "identity_assign_from_signature",
                target_identity: target_identity,
            }

            // INFO: Send the payload to the RPC
            const res = await identities.inferIdentity(demos, payload)
            console.log(res)
        })

        test("Remove associated identity", async () => {
            const target_identity: RemoveIdentityPayload = {
                method: "remove_identity",
                target_identity: {
                    chain: instance.name,
                    subchain: subchain,
                    targetAddress: instance.getAddress(),
                },
            }

            const res = await identities.removeIdentity(demos, target_identity)
            console.log(res)
        })
    },
)
