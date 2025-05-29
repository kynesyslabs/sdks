import { InferFromSignaturePayload } from "@/abstraction"
import { Identities } from "@/abstraction"
import { IBCConnectWalletOptions } from "@/multichain/core"
import {
    EVM,
    IBC,
    MULTIVERSX,
    NEAR,
    SOLANA,
    TON,
    XRPL,
    BTC,
} from "@/multichain/websdk"
import {
    InferFromSignatureTargetIdentityPayload,
    XMCoreTargetIdentityPayload,
} from "@/types/abstraction"
import { Demos, DemosWebAuth } from "@/websdk"
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing"
import chainProviders from "../multichain/chainProviders"
import { wallets } from "../utils/wallets"
import { uint8ArrayToHex } from "@/encryption"

describe.only("IDENTITIES V2", () => {
    test.skip("EVM ADD IDENTITY v2", async () => {
        // const rpc = "https://demosnode.discus.sh"
        const rpc = "http://localhost:53550"
        const identity = DemosWebAuth.getInstance()
        await identity.login(
            "2befb9016e8a39a6177fe8af8624c763da1a6f51b0e7c6ebc58d62749c5c68d55a6f62c7335deb2672a6217c7594c7af9f0fae0e84358673ba268f6901287928",
        )

        const demos = new Demos()

        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey as Uint8Array,
            // {
            //     algorithm: "falcon",
            //     dual_sign: true,
            // }
        )

        const ed25519 = await demos.crypto.getIdentity("ed25519")
        const ed25519_address = uint8ArrayToHex(ed25519.publicKey as Uint8Array)

        const instance = await EVM.create()
        await instance.connectWallet(wallets.evm.privateKey)

        const signature = await instance.signMessage(ed25519_address)
        const verified = await instance.verifyMessage(
            ed25519_address,
            signature,
            instance.getAddress(),
        )

        expect(verified).toBe(true)

        const payload: InferFromSignaturePayload = {
            method: "identity_assign_from_signature",
            target_identity: {
                chain: "evm",
                chainId: instance.chainId,
                subchain: "sepolia",
                signature: signature,
                isEVM: true,
                signedData: ed25519_address,
                targetAddress: instance.getAddress(),
            },
        }

        const identities = new Identities()
        const validityData = await identities.inferXmIdentity(demos, payload)
        // validityData (RPCResponseWithValidityData)
        console.log("validityData: ", validityData)
        console.log("transaction hash: ", validityData.response.data.transaction.hash)

        const res = await demos.broadcast(validityData)
        console.log("res: ", res)

        expect(res).toBeDefined()
        expect(res.result).toBe(200)
    })

    test.only("EVM REMOVE IDENTITY v2", async () => {
        const instance = await EVM.create()
        await instance.connectWallet(wallets.evm.privateKey)

        const rpc = "http://localhost:53550"
        const identity = DemosWebAuth.getInstance()
        await identity.login(
            "0x2befb9016e8a39a6177fe8af8624c763da1a6f51b0e7c6ebc58d62749c5c68d55a6f62c7335deb2672a6217c7594c7af9f0fae0e84358673ba268f6901287928",
        )

        const demos = new Demos()
        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey as Uint8Array, {
            algorithm: "falcon",
            dual_sign: true,
        })

        const identities = new Identities()
        const payload: XMCoreTargetIdentityPayload = {
            chain: "evm",
            isEVM: true,
            subchain: "sepolia",
            targetAddress: instance.getAddress(),
        }

        const validityData = await identities.removeXmIdentity(demos, payload)

        const res = await demos.broadcast(validityData)
        console.log(res)
        expect(res["result"]).toBe(200)
    })
})

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
    {
        name: "BTC",
        sdk: BTC,
        rpc: chainProviders.btc.testnet,
        wallet: wallets.btc.privateKey,
        subchain: "testnet",
    },
]

describe.skip.each(chains)(
    "Identities › $name",
    ({ name, sdk, wallet, subchain, password, rpc }: any) => {
        let instance: any
        const demos: Demos = new Demos()
        const identities: Identities = new Identities()
        const identity: DemosWebAuth = DemosWebAuth.getInstance()

        beforeAll(async () => {
            await identity.create()

            await demos.connect("http://localhost:53550")
            await demos.connectWallet(
                "2befb9016e8a39a6177fe8af8624c763da1a6f51b0e7c6ebc58d62749c5c68d55a6f62c7335deb2672a6217c7594c7af9f0fae0e84358673ba268f6901287928",
            )
        })

        test("Associate an identity using a signature", async () => {
            instance = await sdk.create(null)
            let ibcBase64PublicKey = ""

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
                chainId: instance.chainId,
                isEVM: name === "EVM",
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
            // @ts-ignore
            const validityData = await identities.inferXmIdentity(demos, payload)

            const res = await demos.broadcast(validityData)
            console.log(res)

            expect(res["result"]).toBe(200)
        })

        test.skip("Confirm identity is added", async () => {
            const res = await identities.getIdentities(demos)
            const chain = name.toLowerCase()

            console.log(res["response"]["xm"])

            expect(res["result"]).toBe(200)
            expect(res["response"]["xm"][chain]).toBeDefined()
        })

        test.skip("Remove associated identity", async () => {
            instance = await sdk.create(null)
            let ibcBase64PublicKey = ""

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

            const _signature =
                name === "IBC"
                    ? await instance.signMessage(instance.getAddress(), {
                        privateKey: wallet as string,
                    })
                    : await instance.signMessage(instance.getAddress())

            if (_signature === "Not implemented") {
                throw Error("signMessage not implemented")
            }

            const target_identity: XMCoreTargetIdentityPayload = {
                chain: instance.name,
                subchain: subchain,
                targetAddress: instance.getAddress(),
                isEVM: name === "EVM",
                // signature: _signature,
                // signedData: instance.getAddress(),
                // chainId: instance.chainId,
                // publicKey:
                //     name === "IBC"
                //         ? ibcBase64PublicKey
                //         : instance.wallet.publicKey,
            }

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

            expect(verified).toBe(true)
            // INFO: We don't need the signature to remove the identity
            // const payload: InferFromSignaturePayload = {
            //     method: "identity_assign_from_signature",
            //     target_identity: target_identity,
            // }

            const validityData = await identities.removeXmIdentity(
                demos,
                // @ts-ignore
                target_identity,
            )
            const res = await demos.broadcast(validityData)
            expect(res["result"]).toBe(200)
        })
    },
)

describe.skip("Individual Sign & Verify", () => {
    test("EVM", async () => {
        const instance = await EVM.create()

        await instance.connectWallet(wallets.evm.privateKey)

        const message = "Hello, world!"
        const signature = await instance.signMessage(message)

        const verified = await instance.verifyMessage(
            message,
            signature,
            instance.getAddress(),
        )

        expect(verified).toBe(true)

        const payload: InferFromSignaturePayload = {
            method: "identity_assign_from_signature",
            target_identity: {
                chain: instance.name,
                chainId: instance.chainId,
                isEVM: true,
                subchain: "sepolia",
                signature: signature,
                signedData: message,
                targetAddress: instance.getAddress(),
            },
        }

        // const rpc = "https://demosnode.discus.sh"
        const rpc = "http://localhost:53550"
        const identity = DemosWebAuth.getInstance()
        await identity.create()

        const demos = new Demos()

        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey as Uint8Array)

        const identities = new Identities()
        // @ts-ignore
        const validityData = await identities.inferIdentity(demos, payload)

        expect(validityData.result).toBe(200)

        // const res = await demos.broadcast(validityData)
        // console.log(JSON.stringify(res, null, 2))
        // expect(res["result"]).toBe(200)

        // const res3 = await identities.removeXmIdentity(demos, {
        //     chain: "evm",
        //     subchain: "sepolia",
        //     targetAddress: instance.getAddress(),
        // })
        // const response = await demos.broadcast(res3)
        // expect(response["result"]).toBe(200)
    })

    test("SOLANA", async () => {
        const instance = await SOLANA.create()

        await instance.connectWallet(wallets.solana.privateKey)

        const message = "Hello, world!"
        const signature = await instance.signMessage(message)

        const verified = await instance.verifyMessage(
            message,
            signature,
            instance.getAddress(),
        )

        expect(verified).toBe(true)
    })

    test("EGLD", async () => {
        const instance = await MULTIVERSX.create()

        await instance.connectWallet(wallets.egld.privateKey, {
            password: wallets.egld.password,
        })

        const message = "Hello, world!"

        // Signing
        const signature = await instance.signMessage(message)

        // Verifying signature
        const verified = await instance.verifyMessage(
            message,
            signature,
            instance.getAddress(),
        )

        expect(verified).toBe(true)
    })

    test("NEAR", async () => {
        const instance = await NEAR.create(null)

        await instance.connectWallet(wallets.near.privateKey, {
            accountId: "kynesys.testnet",
            networkId: "testnet",
        })

        const message = "Hello, world!"

        // Signing
        const signature = await instance.signMessage(message)
        console.log(signature)

        // Verifying signature
        const verified = await instance.verifyMessage(
            message,
            signature,
            instance.getAddress(),
        )

        expect(verified).toBe(true)
    })

    test("IBC", async () => {
        const instance = await IBC.create()
        const options: IBCConnectWalletOptions = {
            prefix: "cosmos",
            gasPrice: "0",
        }

        await instance.connectWallet(
            wallets.ibc.privateKey,
            options,
            chainProviders.ibc.testnet,
        )

        const message = "Hello, world!"

        // Signing
        const signature = await instance.signMessage(message, {
            privateKey: wallets.ibc.privateKey,
        })

        // Get the public key
        const sep256k1HdWallet = await DirectSecp256k1HdWallet.fromMnemonic(
            wallets.ibc.privateKey,
            {
                prefix: "cosmos",
            },
        )

        const walletAccounts = await sep256k1HdWallet.getAccounts()
        const currentAccount = walletAccounts.find(account =>
            account.address.startsWith("cosmos"),
        )

        const pubKey = currentAccount?.pubkey
        const ibcBase64PublicKey = Buffer.from(pubKey).toString("base64")

        // Verifying signature
        const verified = await instance.verifyMessage(
            message,
            signature,
            ibcBase64PublicKey,
        )

        expect(verified).toBe(true)
    })

    test("TON", async () => {
        const instance = await TON.create()

        await instance.connectWallet(wallets.ton.privateKey)

        const message = "Hello, world!"

        // Signing
        const signature = await instance.signMessage(message)

        // Verifying signature
        const verified = await instance.verifyMessage(
            message,
            signature,
            instance.wallet.publicKey.toString("hex"),
        )

        console.log(verified)

        expect(verified).toBe(true)
    })

    test("XRPL", async () => {
        const instance = await XRPL.create()

        await instance.connectWallet(wallets.xrpl.privateKey)

        const message = "Hello, world!"

        // Signing
        const signature = await instance.signMessage(message)

        // Verifying signature
        const verified = await instance.verifyMessage(
            message,
            signature,
            instance.wallet.publicKey,
        )
        expect(verified).toBe(true)
    })

    test("BTC", async () => {
        const instance = await BTC.create(
            chainProviders.btc.testnet,
            BTC.networks.testnet,
        )

        await instance.connectWallet(wallets.btc.privateKey)

        const message = "Hello, world!"

        // Signing
        const signature = await instance.signMessage(message)

        // Verifying signature
        const verified = await instance.verifyMessage(
            message,
            signature,
            instance.getAddress(),
        )

        expect(verified).toBe(true)
    })
})
