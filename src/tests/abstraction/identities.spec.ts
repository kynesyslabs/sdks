import { InferFromSignaturePayload } from "@/abstraction"
import Identities from "@/abstraction/Identities"
import { Cryptography } from "@/encryption"
import {
    EVM,
    IBC,
    MULTIVERSX,
    SOLANA,
    TON,
    XRPL,
    NEAR,
} from "@/multichain/websdk"
import { ForgeToHex, HexToForge } from "@/utils/dataManipulation"
import { DemosWebAuth, forgeToString } from "@/websdk"
import { Demos } from "@/websdk/demosclass"
import forge from "node-forge"
import chainProviders from "../multichain/chainProviders"
import { wallets } from "../utils/wallets"
import { InferFromSignatureTargetIdentityPayload } from "@/types/abstraction"

const chains = [
    {
        name: "EVM",
        sdk: EVM,
        subchain: "sepolia",
        rpc: chainProviders.eth.sepolia,
        wallet: wallets.evm.privateKey,
    },
    {
        name: "SOLANA",
        sdk: SOLANA,
        subchain: "testnet",
        rpc: chainProviders.solana.testnet,
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
    ({ name, sdk, rpc, wallet, subchain }: any) => {
        test("Convert hex to forge and back", async () => {
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

            // INFO: Create a new Demos identity
            const identity = DemosWebAuth.getInstance()
            await identity.create()

            // INFO: Create the demos_identity payload
            const publicKey = identity.keypair.publicKey.toString("hex")
            const signature = Cryptography.sign(
                publicKey,
                identity.keypair.privateKey,
            ).toString("hex")

            const payload: InferFromSignaturePayload = {
                method: "identity_assign_from_signature",
                demos_identity: {
                    address: publicKey,
                    signature: signature,
                    signedData: publicKey,
                },
                target_identity: target_identity,
            }

            // INFO: Create a new Demos instance
            const demos = new Demos()
            await demos.connect("http://localhost:53550")
            await demos.connectWallet(identity.keypair.privateKey as any)

            // INFO: Send the payload to the RPC
            const identities = new Identities()
            const res = await identities.inferIdentity(demos, payload)
            console.log(res)
        })
    },
)
