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
import { InferFromSignatureTargetIdentityPayload } from "@/types/abstraction"
import { IBCConnectWalletOptions } from "@/multichain/core"
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing"
import chainProviders from "../multichain/chainProviders"

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
    {
        name: "EGLD",
        sdk: MULTIVERSX,
        rpc: chainProviders.egld.testnet,
        wallet: wallets.egld.privateKey,
        password: wallets.egld.password,
        subchain: "testnet",
    },
    {
        name: "XRPL",
        sdk: XRPL,
        rpc: chainProviders.xrpl.testnet,
        wallet: wallets.xrpl.privateKey,
        subchain: "testnet",
    },
    {
        name: "IBC",
        sdk: IBC,
        rpc: chainProviders.ibc.testnet,
        wallet: wallets.ibc.privateKey,
        subchain: "testnet",
    },
    {
        name: "TON",
        sdk: TON,
        rpc: chainProviders.ton.testnet,
        wallet: wallets.ton.privateKey,
        subchain: "testnet",
    },
    {
        name: "NEAR",
        sdk: NEAR,
        rpc: chainProviders.near.testnet,
        wallet: wallets.near.privateKey,
        subchain: "testnet",
    },
]

describe.each(chains)(
    "Identities › $name",
    ({ name, sdk, wallet, subchain, password, rpc }: any) => {
        let instance: any;
        const demos: Demos = new Demos()
        const identities: Identities = new Identities()
        const identity: DemosWebAuth = DemosWebAuth.getInstance()

        beforeAll(async () => {
            await identity.create()

            await demos.connect("http://localhost:53550")
            await demos.connectWallet(
                "0x2befb9016e8a39a6177fe8af8624c763da1a6f51b0e7c6ebc58d62749c5c68d55a6f62c7335deb2672a6217c7594c7af9f0fae0e84358673ba268f6901287928",
            )
        })

        test("Associate an identity using a signature", async () => {
            instance = await sdk.create(null)
            let ibcBase64PublicKey = "";

            if (name === "EGLD") {
                await instance.connectWallet(wallet, { password: password })
            } else if (name === "IBC") {
                const options: IBCConnectWalletOptions = {
                    prefix: "cosmos",
                    gasPrice: "0",
                }

                await instance.connectWallet(wallet, options, rpc)

                const sep256k1HdWallet =
                    await DirectSecp256k1HdWallet.fromMnemonic(wallet, {
                        prefix: "cosmos",
                    })

                const walletAccounts = await sep256k1HdWallet.getAccounts()
                const currentAccount = walletAccounts.find(account =>
                    account.address.startsWith("cosmos"),
                )

                if (currentAccount) {
                    const pubKey = currentAccount.pubkey
                    ibcBase64PublicKey = Buffer.from(pubKey).toString("base64")
                }
            } else if (name === "NEAR") {
                const options = {
                    accountId: "kynesys.testnet",
                    networkId: "testnet",
                }

                await instance.connectWallet(wallet, options)
            } else {
                await instance.connectWallet(wallet)
            }

            // INFO: Create the target_identity payload
            const _signature =
                name === "IBC"
                    ? await instance.signMessage(instance.getAddress(), {
                          privateKey: wallet as string,
                      })
                    : await instance.signMessage(instance.getAddress())

            if (_signature === "Not implemented") {
                throw Error("signMessage not implemented")
            }

            const target_identity: InferFromSignatureTargetIdentityPayload = {
                chain: instance.name,
                subchain: subchain,
                signature: _signature,
                signedData: instance.getAddress(),
                targetAddress: instance.getAddress(),
                isEVM: name === "EVM",
                chainId: instance.chainId,
                publicKey:
                    name === "IBC"
                        ? ibcBase64PublicKey
                        : instance.wallet.publicKey,
            }

            // INFO: Verify the message locally
            let verified = false

            if (name === "XRPL" || name === "TON" || name === "NEAR") {
                verified = await instance.verifyMessage(
                    instance.getAddress(),
                    _signature,
                    instance.wallet.publicKey,
                )
            } else if (name === "IBC") {
                verified = await instance.verifyMessage(
                    instance.getAddress(),
                    _signature,
                    ibcBase64PublicKey,
                )
            } else {
                verified = await instance.verifyMessage(
                    instance.getAddress(),
                    _signature,
                    instance.getAddress(),
                )
            }

            // INFO: Make sure the message is verifiable
            expect(verified).toBe(true)

            const payload: InferFromSignaturePayload = {
                method: "identity_assign_from_signature",
                target_identity: target_identity,
            }

            // INFO: Send the payload to the RPC
            const res = await identities.inferIdentity(demos, payload)
            console.log(res)

            expect(res['result']).toBe(200)
            expect(res['response']).toBe("Identity added")
        })

        test("Remove associated identity", async () => {
            const target_identity = {
                chain: instance.name,
                subchain: subchain,
                targetAddress: instance.getAddress(),
            }

            const res = await identities.removeIdentity(demos, target_identity)
            console.log(res)

            expect(res['result']).toBe(200)
            expect(res['response']).toBe("Identity removed")
        })
    },
)
