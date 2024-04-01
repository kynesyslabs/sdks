import { IDefaultChainWeb } from '@demos/mx-core'
import { XRPL as XRPLCoreSDK } from '@demos/mx-core'

export class XRPL extends XRPLCoreSDK implements IDefaultChainWeb {
    constructor(rpc_url: string) {
        super(rpc_url)
    }

    // INFO: Add custom methods here
}
