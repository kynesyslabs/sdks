import {
    InMemorySigner,
    KeyPair,
    Near,
    transactions as actions,
    Signer,
    utils,
} from "near-api-js"
import bigInt from "big-integer"
import { IPayOptions } from "."
import { required } from "@demosdk/utils"
import { DefaultChain } from "./types/defaultChain"
import { Transaction } from "near-api-js/lib/transaction"
import { baseDecode, parseNearAmount } from "@near-js/utils"
import * as bip39 from "@scure/bip39"
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes"
import nacl from "tweetnacl"
import { decodeUTF8 } from "tweetnacl-util"

export class NEAR extends DefaultChain {
    networkId: string
    accountId: string
    override provider: Near
    override signer: Signer
    override wallet: KeyPair

    actions: typeof actions = actions

    constructor(rpc_url: string, networkId: string = "testnet") {
        super(rpc_url)

        this.name = "near"
        this.networkId = networkId
        this.setRpc(rpc_url, networkId)
    }

    static override async create<T extends DefaultChain>(
        this: new (rpc_url: string) => T,
        rpc_url: string,
    ): Promise<T> {
        const instance = new this(rpc_url)

        if (rpc_url) {
            await instance.connect()
        }

        return instance
    }

    override setRpc(rpc_url: string, networkId: string = "testnet"): void {
        this.rpc_url = rpc_url
        this.networkId = networkId
        this.provider = new Near({
            networkId: this.networkId,
            nodeUrl: this.rpc_url,
        })
    }

    async connect() {
        try {
            const status = await this.provider.connection.provider.status()
            this.connected = !!status
        } catch (error) {
            console.error(error)
            this.connected = false
        }

        return this.connected
    }

    getAddress(): string {
        return this.wallet.getPublicKey().toString()
    }

    async getBalance(address: string, options?: {}) {
        const account = await this.provider.account(address)
        const balance = await account.getAccountBalance()
        return balance.total
    }

    async connectWallet(
        privateKey: string,
        options: {
            /**
             * The accountId to use with this private key
             */
            accountId: string,
            networkId: string,
        },
    ) {
        required(options && options.accountId, "AccountId is required")

        const seed = bip39.mnemonicToSeedSync(privateKey);
        const derivedSeed = seed.slice(0, 32);
        const base58PrivateKey = bs58.encode(derivedSeed);
        this.wallet = KeyPair.fromString(`ed25519:${base58PrivateKey}` as any);
        this.accountId = options.accountId;
        this.networkId = options?.networkId;

        this.signer = await InMemorySigner.fromKeyPair(
            this.networkId,
            this.accountId,
            this.wallet,
        )
        return this.wallet
    }

    async preparePays(payments: IPayOptions[], options?: {}) {
        required(this.wallet, "Wallet not connected")
        required(this.accountId, "AccountId is required")

        const txs = payments.map(payment => {
            const parsed = parseNearAmount(payment.amount as string)
            const amount = parseFloat(parsed)

            const tx = new Transaction({
                receiverId: payment.address,
                actions: [actions.transfer(bigInt(amount) as any)],
                signerId: this.accountId,
                publicKey: this.wallet.getPublicKey(),
            })

            return tx
        })

        return await this.signTransactions(txs)
    }

    async signTransactions(
        txs: Transaction[],
        options?: { privateKey?: string },
    ) {
        required(this.signer, "Wallet not connected")
        required(this.accountId, "AccountId is required")

        const publicKey = this.wallet.getPublicKey().toString()
        const account = await this.provider.account(this.accountId)
        const info = await account.getAccessKeys()

        let currentNonce = info.find(key => key.public_key === publicKey)
            ?.access_key.nonce

        if (!currentNonce) {
            throw new Error(
                "Failed to get the account nonce for accountId: " +
                    this.accountId,
            )
        }

        const block = await this.provider.connection.provider.block({
            finality: "final",
        })
        const lastBlockHash = block.header.hash

        return Promise.all(
            txs.map(async tx => {
                currentNonce = bigInt(currentNonce).add(1) as any
                tx.nonce = currentNonce
                tx.blockHash = baseDecode(lastBlockHash)

                const res = await actions.signTransaction(
                    tx,
                    this.signer,
                    this.accountId,
                    this.networkId,
                )

                // INFO: The `signTransaction` method returns an array with the hash and the signed tx
                // We return the signed tx
                return res[1].encode()
            }),
        )
    }

    async preparePay(receiver: string, amount: string, options?: any) {
        const txs = await this.preparePays(
            [{ address: receiver, amount }],
            options,
        )
        return txs[0]
    }

    async signTransaction(tx: Transaction, options?: any) {
        const txs = await this.signTransactions([tx], options)
        return txs[0]
    }

    getEmptyTransaction() {
        required(this.accountId, "AccountId is required")
        required(this.wallet, "Wallet not connected")

        return new Transaction({
            receiverId: "",
            actions: [],
            nonce: null,
            signerId: this.accountId,
            blockHash: "",
            publicKey: this.wallet.getPublicKey(),
        })
    }

    /**
     * Create a new account
     * @param accountId The new accountId
     * @param amount The amount of Ⓝ to deposit to the new account
     * @param options Specify the curve to use when generating the key pair for the new account
     * @returns The signed transaction for creating the new account on Near, and its key pair
     */
    async createAccount(
        accountId: string,
        amount: string,
        options?: {
            curve?: "ed25519" | "secp256k1"
        },
    ) {
        const newAccountKey = KeyPair.fromRandom(options?.curve || "ed25519")

        const tx = this.getEmptyTransaction()
        tx.receiverId = accountId
        tx.actions = [
            actions.createAccount(),
            actions.transfer(bigInt(parseNearAmount(amount)) as any),
            actions.addKey(
                newAccountKey.getPublicKey(),
                actions.fullAccessKey(),
            ),
        ]
        const signedTx = await this.signTransaction(tx)

        return {
            signedTx,
            keyPair: newAccountKey,
        }
    }

    async deleteAccount(beneficiallyId: string) {
        const tx = this.getEmptyTransaction()
        tx.receiverId = beneficiallyId
        tx.actions = [actions.deleteAccount(beneficiallyId)]
        return await this.signTransaction(tx)
    }

    // INFO Signing a message
    async signMessage(
        message: string,
        options?: { privateKey?: string },
    ): Promise<string> {
        required(this.wallet || options?.privateKey, "Wallet not connected")
        let wallet = this.wallet
        const messageBytes = decodeUTF8(message)
        const signature = wallet.sign(messageBytes);
        const signatureString = utils.serialize.base_encode(signature.signature);
        
        return signatureString;
    }
    
    // INFO Verifying a message
    override async verifyMessage(
        message: string,
        signature: string,
        publicKey: string,
    ): Promise<boolean> {
        const signatureDecoded = utils.serialize.base_decode(signature);
        const publicKeyObject = utils.key_pair.PublicKey.from(publicKey);
        const publicKeyRaw = Object.values(publicKeyObject.ed25519Key.data);
        const publicKeyDecoded = new Uint8Array(publicKeyRaw);
        const messageBytes = decodeUTF8(message);

        const isValid = nacl.sign.detached.verify(
            messageBytes,
            signatureDecoded,
            publicKeyDecoded
        );
    
        return isValid;
    }
}
