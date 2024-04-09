import { IDefaultChainWeb, XRPL as XRPLCoreSDK } from '@/multichain/core'

export class XRPL extends XRPLCoreSDK implements IDefaultChainWeb {
    constructor(rpc_url: string) {
        super(rpc_url)
    }

    // INFO: Add custom methods here
}
