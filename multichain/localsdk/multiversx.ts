import {
    MULTIVERSX as EGLDCore,
    IDefaultChainLocal,
    required,
} from '@kynesyslabs/mx-core'

import { IPlainTransactionObject, Transaction } from '@multiversx/sdk-core'
import { Mnemonic, UserWallet } from '@multiversx/sdk-wallet'

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

    async sendTransaction(raw_tx: Transaction | IPlainTransactionObject) {
        required(this.provider, 'Provider not connected')
        let signed_tx: Transaction

        // INFO: raw_tx is a plain object when it comes from the frontend
        if (!(raw_tx instanceof Transaction)) {
            signed_tx = Transaction.fromPlainObject(raw_tx)
        } else {
            signed_tx = raw_tx
        }

        // INFO: The provider can also send a list of transactions
        const tx_hash = await this.provider.sendTransaction(
            signed_tx as Transaction
        )

        return {
            result: 'success',
            hash: tx_hash,
        }
    }
}
