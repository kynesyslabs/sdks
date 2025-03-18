import { IDefaultChainWeb, BTC as BTCCoreSDK } from '@/multichain/core'

export class BTC extends BTCCoreSDK implements IDefaultChainWeb {
    constructor(rpc_url: string) {
        super(rpc_url)
    }

    // TODO: Add methods here
}
