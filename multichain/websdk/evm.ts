import { EVM as EVMCoreSDK, IDefaultChainWeb } from '@demos/mx-core'

export class EVM extends EVMCoreSDK implements IDefaultChainWeb {
    constructor(rpc_url: string) {
        super(rpc_url)
    }

    // INFO: Add custom methods here
}
