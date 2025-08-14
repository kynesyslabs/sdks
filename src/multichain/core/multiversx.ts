import {
    Account,
    Address,
    GasEstimator,
    IPlainTransactionObject,
    TokenTransfer,
    Transaction,
    TransferTransactionsFactory,
    UserVerifier,
} from "@multiversx/sdk-core"
import { ExtensionProvider } from "@multiversx/sdk-extension-provider"
import { ApiNetworkProvider } from "@multiversx/sdk-network-providers"
import { INetworkProvider } from "@multiversx/sdk-network-providers/out/interface"
import { UserSigner } from "@multiversx/sdk-wallet"
import bech32 from 'bech32'; 
import { DefaultChain } from "./types/defaultChain"
import { required } from "./utils"
import { EGLDSignTxOptions, IPayParams } from "./types/interfaces"

// import {
//     DefaultChain,
//     EGLDSignTxOptions,
//     IPayOptions,
//     required,
// } from "@/multichain/core"

export class MULTIVERSX extends DefaultChain {
    declare provider: INetworkProvider
    declare wallet: UserSigner | ExtensionProvider
    chainId: string = ""

    constructor(rpc_url: string) {
        super(rpc_url)
        this.name = "egld"

        if (rpc_url) {
            this.setRPC(rpc_url)
        }
    }

    setRPC(rpc_url: string) {
        this.rpc_url = rpc_url
        this.provider = new ApiNetworkProvider(this.rpc_url)
    }

    async connect() {
        required(this.provider, "Provider not connected")
        try {
            const networkConfig = await this.provider.getNetworkConfig()
            this.chainId = networkConfig.ChainID

            this.connected = Boolean(this.chainId)
            return this.connected
        } catch (error) {
            this.connected = false
        }

        return false
    }

    async connectKeyFileWallet(keyFile: string, password: string) {
        try {
            // INFO: Parse the keyFile JSON string
            keyFile = JSON.parse(keyFile)
        } catch (error) {
            throw new Error("Failed to load the wallet. Invalid KeyFile!")
        }

        return UserSigner.fromWallet(keyFile, password)
    }

    async connectWallet(privateKey: string, options: { password: string }) {
        // INFO: This method is overriden in the web sdk
        // to connect with the extension wallet
        this.wallet = await this.connectKeyFileWallet(
            privateKey,
            options?.password as string,
        )
        return this.wallet
    }

    getAddress() {
        // INFO: method is overriden in the web sdk
        required(this.wallet, "Wallet not connected")
        return (this.wallet as UserSigner).getAddress().bech32()
    }

    // SECTION: ReadsIntegrated 

    async getBalance(address: string): Promise<string> {
        required(address, "address is required to get the balance")

        const Iaddress = new Address(address)
        const account = await this.provider.getAccount(Iaddress)

        return account.balance.toString()
    }

    async getTokenBalance(token_id: string) {
        required(this.provider)
        required(this.wallet)

        const walletAddress = this.getAddress()
        const address = new Address(walletAddress)
        const token = await this.provider.getFungibleTokenOfAccount(
            address,
            token_id,
        )

        return token.balance.toNumber()
    }

    async getNFTs() {
        required(this.provider)
        required(this.wallet)

        const address = this.getAddress()
        const account = new Address(address)
        return this.provider.getNonFungibleTokensOfAccount(account)
    }

    override async signMessage(message: string, options?: { privateKey?: string }): Promise<string> {
        required(this.wallet || options?.privateKey, "Wallet not connected")
        let wallet = this.wallet as UserSigner;
        const signedMessage = wallet.sign(Buffer.from(message))
        const signedMessageString = (await signedMessage).toString('hex');

        return signedMessageString;
    }

    override async verifyMessage(message: string, signature: string, publicKey: string): Promise<boolean> {
        const decodedAddress = bech32.decode(publicKey);
        const publicKeyBuffer = Buffer.from(bech32.fromWords(decodedAddress.words));
        const address = new Address(publicKeyBuffer);
        const userVerifier = UserVerifier.fromAddress(address);
        const isVerified = userVerifier.verify(Buffer.from(message), Buffer.from(signature, 'hex'));

        return isVerified
    }

    // SECTION: Writes
    /**
     * Signs a single transaction. Calls `signTransactions` with a single transaction and returns the first element of the result.
     * @returns The signed transaction as a plain object
     */
    async signTransaction(
        transaction: Transaction,
        options: EGLDSignTxOptions,
    ) {
        const txs = await this.signTransactions([transaction], options)
        return txs[0]
    }

    protected async addTxNonces(transactions: Transaction[]) {
        required(this.provider, "Provider not connected")

        // INFO: Retrieve account on network to get nonce
        const senderBech32 = this.getAddress()
        const senderAddress = new Address(senderBech32)

        const account = new Account(senderAddress)
        const senderOnNetwork = await this.provider.getAccount(senderAddress)
        account.update(senderOnNetwork)

        // INFO: Local nonce management
        // LINK: https://docs.multiversx.com/integrators/creating-transactions/#nonce-management
        let currentNonce = account.nonce.valueOf()

        transactions.forEach(tx => {
            tx.setNonce(currentNonce)
            // INFO: Increment the nonce for the next tx
            currentNonce++
        })

        return transactions
    }

    /**
     * Signs multiple transactions
     * @returns The signed transactions as an array of plain objects
     */
    async signTransactions(
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
        for (const tx of transactions) {
            const serializedTx = tx.serializeForSigning()
            const txSign = await (this.wallet as UserSigner).sign(serializedTx)

            tx.applySignature(txSign)
        }

        return transactions.map(tx => {
            // INFO: Return plain objects
            return tx.toSendable()
        })
    }

    async preparePay(address: string, amount: string) {
        const txs = await this.preparePays([{ address, amount }])
        return txs[0]
    }

    async preparePays(payments: IPayParams[]) {
        required(this.wallet)

        const sender = this.getAddress()
        const senderAddress = new Address(sender)

        const transactions = payments.map(payment => {
            const transfer = TokenTransfer.egldFromAmount(payment.amount)
            const receiverAddress = new Address(payment.address)
            const factory = new TransferTransactionsFactory(new GasEstimator())

            return factory.createEGLDTransfer({
                value: transfer,
                sender: senderAddress,
                receiver: receiverAddress,
                chainID: this.chainId,
            })
        })

        return this.signTransactions(transactions)
    }

    // SECTION Unimplemented methods
    getEmptyTransaction() {
        throw new Error("Method not implemented.")
    }
}
