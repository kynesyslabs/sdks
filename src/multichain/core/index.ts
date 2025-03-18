export {
    DefaultChain,
    IBCDefaultChain,
    IDefaultChainLocal,
    IDefaultChainWeb,
    IEVMDefaultChain
} from './types/defaultChain'

export {
    EGLDSignTxOptions,
    IBCConnectWalletOptions,
    IBCGetBalanceOptions,
    IBCPreparePayOptions,
    IBCSignTxOptions,
    IBCTransaction,
    IPayParams as IPayOptions,
    XmTransactionResponse as TransactionResponse
} from './types/interfaces'

export { required } from './utils'

// SECTION: Chain SDKs
export { EVM } from './evm'
export { IBC } from './ibc'
export { MULTIVERSX } from './multiversx'
export { SOLANA } from './solana'
export { TON } from "./ton"
export { BTC } from "./btc"

// The official XRPL Library is called "xrpl" which conflicts with the name of our XRPL SDK
export { XRPL, xrplGetLastSequence } from './xrp'
export { NEAR } from './near'