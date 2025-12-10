import { IBC as IBCCore, IDefaultChainLocal, TransactionResponse, required } from '@/multichain/core'
import { XmTransactionResult } from '../core/types/interfaces'

export class IBC extends IBCCore implements IDefaultChainLocal {
    constructor(rpc_url: string) {
        super(rpc_url)
    }

    async sendTransaction(signed_tx: Uint8Array): Promise<TransactionResponse> {
        required(this.provider, 'Provider not connected')

        const hash = await this.provider.broadcastTxSync(signed_tx)
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
