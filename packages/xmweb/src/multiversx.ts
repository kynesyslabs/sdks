import { UserSigner } from "@multiversx/sdk-wallet"
import { ExtensionProvider } from "@multiversx/sdk-extension-provider"
import { IPlainTransactionObject, Transaction } from "@multiversx/sdk-core"

import {
    MULTIVERSX as EGLDCore,
    EGLDSignTxOptions,
    IDefaultChainWeb,
} from "@kynesyslabs/xmcore"
import { required } from "@kynesyslabs/utils"

export class MULTIVERSX extends EGLDCore implements IDefaultChainWeb {
    constructor(rpc_url: string) {
        super(rpc_url)
    }

    override getAddress() {
        // INFO: method is overriden in the web sdk
        required(this.wallet, "Wallet not connected")

        if (this.wallet instanceof ExtensionProvider) {
            return this.wallet.account.address
        } else if (this.wallet instanceof UserSigner) {
            return this.wallet.getAddress().bech32()
        }

        throw new Error("Unknown wallet type. Can't get address.")
    }

    /**
     * Connect a Multiversx wallet. Pass the `keyFile` JSON string as the `privateKey` and its `password` to override the De-Fi wallet prompt.
     */
    // @ts-expect-error // INFO: Return type error
    override async connectWallet(
        privateKey?: string,
        options?: {
            password: string
        },
    ) {
        if (privateKey && options && options?.password) {
            this.wallet = await this.connectKeyFileWallet(privateKey, options.password)
            return this.wallet
        }

        this.wallet = ExtensionProvider.getInstance()
        await this.wallet.init()

        // INFO: wallet.isInitialized() checks if the wallet is installed.
        // It's equivalent to checking for `window.elrondWallet` object which is injected by the extension
        // LINK to src: https://github.com/multiversx/mx-sdk-js-extension-provider/blob/36518d0fe0b295de8d2b977727f0c30cdc014c78/src/extensionProvider.ts#L45

        if (!this.wallet.isInitialized()) {
            throw new Error(
                "Wallet not detected. Is the MultiversX DeFi Wallet extension installed?",
            )
        }

        await this.wallet.login()
        return this.wallet
    }

    override async signTransactions(
        transactions: Transaction[],
        options?: EGLDSignTxOptions,
    ): Promise<IPlainTransactionObject[]> {
        required(this.wallet || options?.privateKey, "Wallet not connected")

        // INFO: Override wallet connection
        if (options?.privateKey) {
            await this.connectWallet(options.privateKey, {
                password: options.password,
            })
        }

        transactions = await this.addTxNonces(transactions)

        try {
            // INFO: When wallet is loaded from Extension
            transactions = await (
                this.wallet as ExtensionProvider
            ).signTransactions(transactions)
        } catch (error) {
            for (const tx of transactions) {
                const serializedTx = tx.serializeForSigning()
                const txSign = await (this.wallet as UserSigner).sign(
                    serializedTx,
                )

                tx.applySignature(txSign)
            }
        }

        return transactions.map(tx => {
            // INFO: Return plain objects
            return tx.toSendable()
        })
    }
}
