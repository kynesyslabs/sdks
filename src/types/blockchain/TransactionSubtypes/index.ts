export * from './L2PSTransaction'
export * from './Web2Transaction'
export * from './CrosschainTransaction'
export * from './NativeTransaction'
export * from './DemosworkTransaction'
export * from './IdentityTransaction'
export * from './InstantMessagingTransaction'
export * from './NativeBridgeTransaction'
export * from './StorageTransaction'

// Re-export all transaction types as a union
import { L2PSTransaction } from './L2PSTransaction'
import { Web2Transaction } from './Web2Transaction'
import { CrosschainTransaction } from './CrosschainTransaction'
import { NativeTransaction } from './NativeTransaction'
import { DemosworkTransaction } from './DemosworkTransaction'
import { IdentityTransaction } from './IdentityTransaction'
import { InstantMessagingTransaction } from './InstantMessagingTransaction'
import { NativeBridgeTransaction } from './NativeBridgeTransaction'
import { StorageTransaction } from './StorageTransaction'

export type SpecificTransaction =
    | L2PSTransaction
    | Web2Transaction
    | CrosschainTransaction
    | NativeTransaction
    | DemosworkTransaction
    | IdentityTransaction
    | InstantMessagingTransaction
    | NativeBridgeTransaction
    | StorageTransaction 