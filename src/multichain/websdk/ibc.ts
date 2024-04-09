import { IBC as IBCCoreSDK, IDefaultChainWeb } from '@/multichain/core'

// INFO: Websdk is the same as the core sdk
export class IBC extends IBCCoreSDK implements IDefaultChainWeb {
    constructor(rpc_url: string) {
        super(rpc_url)
    }

    // INFO: Add custom methods here
}
