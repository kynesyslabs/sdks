import * as bitcoin from "bitcoinjs-lib"
import { IDefaultChainWeb, BTC as BTCCoreSDK } from '@/multichain/core'

export class BTC extends BTCCoreSDK implements IDefaultChainWeb {
    constructor(rpc_url: string, network: bitcoin.Network) {
        super(rpc_url, network)
    }

    // TODO: Add methods here
}
