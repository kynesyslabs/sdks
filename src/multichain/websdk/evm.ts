import { EVM as EVMCoreSDK, IDefaultChainWeb } from '@/multichain/core'

export class EVM extends EVMCoreSDK implements IDefaultChainWeb {
    constructor(rpc_url: string) {
        super(rpc_url)
    }

    // INFO: Add custom methods here
}
