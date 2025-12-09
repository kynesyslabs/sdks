import {
    MULTIVERSX as EGLDCore,
    IDefaultChainLocal,
    TransactionResponse,
    required,
} from '@/multichain/core'

import { IPlainTransactionObject, Transaction } from '@multiversx/sdk-core'
import { Mnemonic, UserWallet } from '@multiversx/sdk-wallet'
import { XmTransactionResult } from '../core/types/interfaces'

export class MULTIVERSX extends EGLDCore implements IDefaultChainLocal {
    constructor(rpc_url: string) {
        super(rpc_url)
    }

    async getInfo() {
        throw new Error('Method not implemented.')
    }

    async createWallet(password: string, addressIndex?: number) {
        required(password, 'Password is required to encrypt the key file')

        const mnemonics = Mnemonic.generate()

        const words = mnemonics.getWords()
        const words_with_index = words.map((word, index) => index + '. ' + word)

        const secretKey = mnemonics.deriveKey(addressIndex, password)
        const wallet = UserWallet.fromSecretKey({ secretKey, password })

        const jsonWallet = wallet.toJSON()

        // NOTE: .bech32 is the address property
        const walletAddress: string = jsonWallet.bech32

        // TODO Return downloadable mnemonics & json files
        return {
            mnemonics: words,
            address: walletAddress,
            mnemonics_txt: words_with_index.join(''),
            wallet_keyfile: JSON.stringify(jsonWallet, null, 2),
        }
    }

    async sendTransaction(raw_tx: Transaction | IPlainTransactionObject | string): Promise<TransactionResponse> {
        required(this.provider, 'Provider not connected')

        if (raw_tx instanceof Transaction) {
            const tx_hash = await this.provider.sendTransaction(raw_tx)

            return {
                result: XmTransactionResult.success,
                hash: tx_hash,
            }
        }

        // Handle hex-encoded JSON string
        let plainTx: IPlainTransactionObject
        if (typeof raw_tx === 'string') {
            let jsonString = raw_tx;
            if (raw_tx.startsWith('0x')) {
                jsonString = Buffer.from(raw_tx.slice(2), 'hex').toString('utf-8');
            }
            plainTx = JSON.parse(jsonString) as IPlainTransactionObject;
        } else {
            plainTx = raw_tx
        }

        // This bypasses prepareTransactionForBroadcasting which expects Buffer objects
        // The plain object format from toPlainObject() is already API-compatible
        const response = await (this.provider as any).doPostGeneric('transactions', plainTx)
        const tx_hash = response.txHash

        return {
            result: XmTransactionResult.success,
            hash: tx_hash,
        }
    }
}
