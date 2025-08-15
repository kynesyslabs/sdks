import { TransactionRequest } from 'ethers'

import { required } from '@kimcalc/utils'
import { EVM as EVMCore, IDefaultChainLocal } from '@kimcalc/xmcore'
import { XmTransactionResult, TransactionResponse } from '@kimcalc/xmcore'

export class EVM extends EVMCore implements IDefaultChainLocal {
    private static instances: Map<number, EVM> = new Map<number, EVM>()

    async getInfo() {
        throw new Error('Method not implemented.')
    }

    async createWallet(password: string) {
        throw new Error('Method not implemented.')
    }

    async sendRawTransaction(raw_tx: any) {
        throw new Error('Method not implemented.')
    }

    async sendSignedTransaction(signed_tx: string) {
        required(this.provider, 'Provider not connected')

        const res = await this.provider.broadcastTransaction(signed_tx)

        return {
            result: 'success',
            hash: res.hash,
        }
    }

    async sendTransaction(tx: TransactionRequest) :Promise<TransactionResponse> {
        required(this.wallet, 'Wallet not connected')
        const txResponse = await this.wallet.sendTransaction(tx) // NOTE It will be signed automatically
        return {
            result: XmTransactionResult.success,
            hash: txResponse.hash,
        }
    }

    /**
     * The static method that controls the access to the singleton instance.
     *
     * This implementation let you subclass the Singleton class while keeping
     * just one instance of each subclass around.
     */

    // INFO Getting an instance (if it exists) or false so that we can call createInstance
    public static getInstance(chain_id: number): EVM | null {
        if (!EVM.instances.get(chain_id)) {
            return null
        }

        return EVM.instances.get(chain_id) || null
    }

    // INFO Creating an instance from a rpc url if not already created
    public static createInstance(chain_id: number, rpc_url: string): EVM {
        if (!EVM.instances.get(chain_id)) {
            EVM.instances.set(chain_id, new EVM(rpc_url, chain_id))
        }

        const instance = EVM.instances.get(chain_id)

        if (instance) {
            return instance
        }

        throw new Error('Could not create instance')
    }
}
