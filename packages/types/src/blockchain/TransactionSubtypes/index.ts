import { L2PSTransaction, L2PSTransactionContent } from './L2PSTransaction'
import { L2PSHashPayload, L2PSHashTransaction, L2PSHashTransactionContent } from './L2PSHashTransaction'
import { Web2Transaction, Web2TransactionContent } from './Web2Transaction'
import { CrosschainTransaction, CrosschainTransactionContent } from './CrosschainTransaction'
import { NativeTransaction, NativeTransactionContent } from './NativeTransaction'
import { DemosworkTransaction, DemosworkTransactionContent } from './DemosworkTransaction'
import { IdentityTransaction, IdentityTransactionContent } from './IdentityTransaction'
import { InstantMessagingTransaction, InstantMessagingTransactionContent } from './InstantMessagingTransaction'
import { NativeBridgeTransaction, NativeBridgeTransactionContent } from './NativeBridgeTransaction'
import { StoragePayload, StorageTransaction, StorageTransactionContent } from './StorageTransaction'

export type SpecificTransaction =
    | L2PSTransaction
    | L2PSHashTransaction
    | Web2Transaction
    | CrosschainTransaction
    | NativeTransaction
    | DemosworkTransaction
    | IdentityTransaction
    | InstantMessagingTransaction
    | NativeBridgeTransaction
    | StorageTransaction


export {
    L2PSTransaction,
    L2PSHashTransaction,
    Web2Transaction,
    CrosschainTransaction,
    NativeTransaction,
    DemosworkTransaction,
    IdentityTransaction,
    InstantMessagingTransaction,
    NativeBridgeTransaction,
    StorageTransaction,
    L2PSTransactionContent,
    L2PSHashTransactionContent,
    Web2TransactionContent,
    CrosschainTransactionContent,
    NativeTransactionContent,
    DemosworkTransactionContent,
    IdentityTransactionContent,
    InstantMessagingTransactionContent,
    NativeBridgeTransactionContent,
    StorageTransactionContent,
    L2PSHashPayload,
    StoragePayload,
}