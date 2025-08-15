import { required } from '@demosdk/utils'

import { IBC as IBCCore, IDefaultChainLocal } from '@demosdk/xmcore'
import { XmTransactionResult, TransactionResponse } from '@demosdk/xmcore'

export class IBC extends IBCCore implements IDefaultChainLocal {
    constructor(rpc_url: string) {
        super(rpc_url)
    }

    async sendTransaction(signed_tx: Uint8Array): Promise<TransactionResponse> {
        required(this.wallet, 'Wallet not connected')

        const hash = await this.wallet.broadcastTxSync(signed_tx)
        return {
            hash,
            result: XmTransactionResult.success,
        }
    }

    async getInfo(): Promise<string> {
        throw new Error('Method not implemented.')
    }

    async createWallet(password?: string) {
        throw new Error('Method not implemented.')
    }
}
