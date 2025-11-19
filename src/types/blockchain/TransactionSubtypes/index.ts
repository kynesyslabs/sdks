export * from './L2PSTransaction'
export * from './L2PSHashTransaction'
export * from './Web2Transaction'
export * from './CrosschainTransaction'
export * from './NativeTransaction'
export * from './DemosworkTransaction'
export * from './IdentityTransaction'
export * from './InstantMessagingTransaction'
export * from './NativeBridgeTransaction'
export * from './StorageTransaction'
export * from './StorageProgramTransaction'
export * from './ContractDeployTransaction'
export * from './ContractCallTransaction'
export * from './D402PaymentTransaction'
export * from './EscrowTransaction'

// Re-export all transaction types as a union
import { L2PSTransaction } from './L2PSTransaction'
import { L2PSHashTransaction } from './L2PSHashTransaction'
import { Web2Transaction } from './Web2Transaction'
import { CrosschainTransaction } from './CrosschainTransaction'
import { NativeTransaction } from './NativeTransaction'
import { DemosworkTransaction } from './DemosworkTransaction'
import { IdentityTransaction } from './IdentityTransaction'
import { InstantMessagingTransaction } from './InstantMessagingTransaction'
import { NativeBridgeTransaction } from './NativeBridgeTransaction'
import { StorageTransaction } from './StorageTransaction'
import { StorageProgramTransaction } from './StorageProgramTransaction'
import { ContractDeployTransaction } from './ContractDeployTransaction'
import { ContractCallTransaction } from './ContractCallTransaction'
import { D402PaymentTransaction } from './D402PaymentTransaction'
import { EscrowTransaction } from './EscrowTransaction'

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
    | StorageProgramTransaction
    | ContractDeployTransaction
    | ContractCallTransaction
    | D402PaymentTransaction
    | EscrowTransaction 