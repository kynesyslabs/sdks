import {
    DirectSecp256k1HdWallet,
    DirectSecp256k1Wallet,
} from '@cosmjs/proto-signing'
import {
    SigningStargateClient,
    StargateClient,
    calculateFee,
} from '@cosmjs/stargate'
import { fromBase64, toBase64 } from '@cosmjs/encoding';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx'

import { DefaultChain, IBCDefaultChain } from './types/defaultChain'
import {
    IBCConnectWalletOptions,
    IBCGetBalanceOptions,
    IBCPreparePayOptions,
    IBCSignTxOptions,
    IBCTransaction,
    IPayParams,
} from './types/interfaces'
import { required } from './utils'
import { createHash } from 'crypto';
import { Secp256k1, Secp256k1Signature } from '@cosmjs/crypto';
import * as bip39 from "@scure/bip39"
import * as bip32 from "@scure/bip32"

export class IBC extends DefaultChain implements IBCDefaultChain {
    address: string = ''
    chainId: string = ''
    declare provider: StargateClient
    declare wallet: SigningStargateClient
    declare signer: DirectSecp256k1Wallet | DirectSecp256k1HdWallet

    // IBC options
    gasPrice: string = ''
    multiplier: number = 2.0

    constructor(rpc_url: string) {
        super(rpc_url)
        this.name = 'ibc';
    }

    override async setRpc(rpc_url: string) {
        this.rpc_url = rpc_url;
        this.provider = await StargateClient.connect(rpc_url);
    }

    // INFO: rpc_url used to avoid overwriting this.provider for test mocking
    async connect(rpc_url?: string) {
        if (!this.provider || (rpc_url && rpc_url !== this.rpc_url)) {
            const url = rpc_url || this.rpc_url;
            this.rpc_url = url;
            this.provider = await StargateClient.connect(url);
        }

        try {
            const chain_id = await this.provider.getChainId()
            this.chainId = chain_id

            this.connected = Boolean(chain_id)
        } catch (error) {
            this.connected = false
        }

        return this.connected
    }

    async connectWallet(privateKey: string, options: IBCConnectWalletOptions, rpc_url?: string) {
        required(options.prefix, 'Address prefix not provided')
        required(options.gasPrice, 'Gas price not provided')

        // INFO: Store the gasPrice for preparePays and other methods
        this.gasPrice = options.gasPrice

        // INFO: Check if privateKey is a mnemonic or a private key
        const isPrivateKey = privateKey.split(' ').length === 1

        // INFO: Create a signer using the appropriate wallet
        if (isPrivateKey) {
            // TODO: Test this block!
            const buffer = Buffer.from(privateKey, 'hex')
            this.signer = await DirectSecp256k1Wallet.fromKey(
                buffer,
                options.prefix
            )
        } else {
            this.signer = await DirectSecp256k1HdWallet.fromMnemonic(
                privateKey,
                {
                    prefix: options.prefix,
                }
            )
        }

        // INFO: Store the address as .getAddress can't be async
        const wallet_accounts = await this.signer.getAccounts()
        const this_account = wallet_accounts.find((account) =>
            account.address.startsWith(options.prefix)
        )

        if (this_account) {
            this.address = this_account.address
        } else {
            throw new Error(`No account found for prefix: ${options.prefix}`)
        }

        if (rpc_url) {
            this.setRpc(rpc_url);
        }

        this.rpc_url = rpc_url || this.rpc_url;

        this.wallet = await SigningStargateClient.connectWithSigner(
            this.rpc_url,
            this.signer
        )

        this.chainId = await this.wallet.getChainId()

        return this.wallet
    }

    getAddress() {
        return this.address
    }

    /**
     * Get the balance of the address
     * @param address The address
     * @param options Specify the denomination of the token
     * @returns The balance of the address in the specified denomination
     */
    async getBalance(address: string, options: IBCGetBalanceOptions) {
        required(this.provider, 'Provider not connected')

        const coins = await this.provider.getBalance(address, options.denom)
        return coins.amount
    }

    getEmptyTransaction(): IBCTransaction {
        return {
            signerAddress: this.getAddress(),
            messages: [
                {
                    typeUrl: '/cosmos.bank.v1beta1.MsgSend',
                    value: {
                        fromAddress: this.getAddress(),
                        toAddress: '',
                        amount: [{ denom: '', amount: '' }],
                    },
                },
            ],
            // INFO: Fees are to be estimated when filling the tx
            fee: null,
            memo: '',
        }
    }

    async preparePay(
        receiver: string,
        amount: string,
        options: IBCPreparePayOptions
    ) {
        // INFO: Call preparePays with a single payment
        const tx = await this.preparePays(
            [{ address: receiver, amount }],
            options
        )
        return tx[0]
    }

    /**
     * Prepare multiple payments
     * @param payments An array of payments
     * @param options Specifies the denomination of the token
     * @returns An array of signed transactions
     */
    async preparePays(payments: IPayParams[], options: IBCPreparePayOptions) {
        // INFO: Create an array of transactions
        const txs = payments.map((payment) => {
            const tx = this.getEmptyTransaction()

            // INFO: Fill the tx
            tx.messages[0].value.toAddress = payment.address

            tx.messages[0].value.amount = [
                {
                    denom: options.denom,
                    amount: payment.amount as string,
                },
            ]
            return tx
        })

        // INFO: Estimate the fee for the first tx
        const fees = await this.estimateTxFee(txs[0])

        // INFO: Since all txs here are similar, set same fee for all
        txs.forEach((tx) => {
            tx.fee = fees
        })

        // INFO: Sign and return the txs
        return await this.signTransactions(txs)
    }

    override async signMessage(message: string, options?: { privateKey?: string }): Promise<string> {
        required(options && options?.privateKey, "Wallet not connected")

        // Check if privateKey is a mnemonic or raw private key
        const isMnemonic = options.privateKey.includes(' ')

        let privateKey: Uint8Array
        let publicKey: Uint8Array

        if (isMnemonic) {
            const seed = bip39.mnemonicToSeedSync(options.privateKey)
            const hdkey = bip32.HDKey.fromMasterSeed(seed)
            const derivedKey = hdkey.derive("m/44'/118'/0'/0/0")
            privateKey = derivedKey.privateKey!
            publicKey = derivedKey.publicKey!
        } else {
            const privateKeyBytes = Buffer.from(options.privateKey, 'hex')
            const keypair = await Secp256k1.makeKeypair(privateKeyBytes)
            privateKey = privateKeyBytes
            publicKey = Secp256k1.compressPubkey(keypair.pubkey)
        }

        const messageHash = createHash('sha256').update(message).digest()
        const signObj = await Secp256k1.createSignature(messageHash, privateKey)
        const fixedLengthData = signObj.toFixedLength()
        const base64Signature = toBase64(fixedLengthData)
        const base64PublicKey = toBase64(publicKey)

        // Return signature|publicKey so both can be extracted
        return `${base64Signature}|${base64PublicKey}`
    }

    override async verifyMessage(message: string, signature: string, publicKey: string): Promise<boolean> {
        const signatureBytes = fromBase64(signature);
        const rAndSBytes = signatureBytes.slice(0, 64);
        const publicKeyBytes = fromBase64(publicKey);
        const signatureObj = Secp256k1Signature.fromFixedLength(rAndSBytes);
        const messageHash = createHash('sha256').update(message).digest();
        const isVerified = await Secp256k1.verifySignature(signatureObj, messageHash, publicKeyBytes);

        return isVerified;
    }

    async signTransaction(tx: IBCTransaction, options?: IBCSignTxOptions) {
        // INFO: Call signTransactions with a single tx
        const signed_txs = await this.signTransactions([tx], options)
        return signed_txs[0]
    }

    /**
     * Estimate the fee for a transaction
     * @param tx The transaction
     * @returns The estimate fee for the transaction
     */
    private async estimateTxFee(tx: IBCTransaction) {
        const signerAddress = this.getAddress()
        const gasEstimate = await this.wallet.simulate(
            signerAddress,
            tx.messages,
            tx.memo
        )

        const gasLimit = Math.round(gasEstimate * this.multiplier)
        return calculateFee(gasLimit, this.gasPrice)
    }

    async signTransactions(
        transactions: IBCTransaction[],
        options?: IBCSignTxOptions
    ) {
        required(this.wallet, 'Wallet not connected')

        if (options?.privateKey) {
            const { privateKey, ...connectOptions } = options
            await this.connectWallet(privateKey, connectOptions)
        }

        // NOTE: Sequence management happens here
        // INFO: Get account on network
        const address = this.getAddress()
        console.log("address: ", address)
        const account = await this.wallet.getAccount(address)
        console.log("account: ", account)

        if (!account) {
            throw new Error(`Account ${address} not found`)
        }

        // INFO: Store the current sequence
        let current_sequence = account.sequence

        const signed_txs = transactions.map(async (tx) => {
            const signerInfo = {
                sequence: current_sequence,
                accountNumber: account.accountNumber,
                chainId: this.chainId,
            }

            if (tx.fee === null) {
                // INFO: Throw an error if fee is not set
                console.error('Fee not set for tx: ', tx)
                throw new Error('Fee not set for tx')
            }

            // INFO: Increment the sequence for next round
            current_sequence++

            // INFO: Sign the tx
            const signed_tx = await this.wallet.sign(
                tx.signerAddress,
                tx.messages,
                tx.fee,
                tx.memo,
                signerInfo
            )

            // INFO: Convert raw tx to bytes array (Ready for broadcast)
            const tx_bytes = TxRaw.encode(signed_tx).finish()
            return tx_bytes
        })

        // INFO: Return the signed transactions
        return await Promise.all(signed_txs)
    }

    override async disconnect() {
        this.resetInstance()
        this.address = ''
        this.gasPrice = ''
        return !this.connected
    }

    // SECTION: Unimplemented methods
    async ibcSend() {
        // TODO: Implement IBC send
        // REFERENCE: https://github.com/cosmos/cosmjs/blob/33271bc51c/packages/stargate/src/signingstargateclient.ts#L246
        throw new Error('Method not implemented')
    }
}
