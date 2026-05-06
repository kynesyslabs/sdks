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
export * from './IPFSTransaction'
// REVIEW: Token transaction types
export * from './TokenTransaction'
// Validator staking (Phase 0 / upgradable_network)
export * from './ValidatorStakeTransaction'
export * from './ValidatorUnstakeTransaction'
export * from './ValidatorExitTransaction'
// Stackable-genesis governance (Phase 1 / upgradable_network)
export * from './NetworkUpgradeTransaction'
export * from './NetworkUpgradeVoteTransaction'

// Re-export all transaction types as a union
import { L2PSTransaction } from './L2PSTransaction'
import { L2PSHashTransaction } from './L2PSHashTransaction'
import { Web2Transaction } from './Web2Transaction'
import { CrosschainTransaction } from './CrosschainTransaction'
import { NativeTransaction } from './NativeTransaction'
import { DemosworkTransaction } from './DemosworkTransaction'
import { IdentityTransaction } from './IdentityTransaction'
import { InstantMessagingTransaction, L2PSInstantMessagingTransaction } from './InstantMessagingTransaction'
import { NativeBridgeTransaction } from './NativeBridgeTransaction'
import { StorageTransaction } from './StorageTransaction'
import { StorageProgramTransaction } from './StorageProgramTransaction'
import { ContractDeployTransaction } from './ContractDeployTransaction'
import { ContractCallTransaction } from './ContractCallTransaction'
import { D402PaymentTransaction } from './D402PaymentTransaction'
import { EscrowTransaction } from './EscrowTransaction'
import { IPFSTransaction } from './IPFSTransaction'
// REVIEW: Token transaction types
import { TokenCreationTransaction } from './TokenTransaction'
import { TokenExecutionTransaction } from './TokenTransaction'
import { ValidatorStakeTransaction } from './ValidatorStakeTransaction'
import { ValidatorUnstakeTransaction } from './ValidatorUnstakeTransaction'
import { ValidatorExitTransaction } from './ValidatorExitTransaction'
import { NetworkUpgradeTransaction } from './NetworkUpgradeTransaction'
import { NetworkUpgradeVoteTransaction } from './NetworkUpgradeVoteTransaction'

export type SpecificTransaction =
    | L2PSTransaction
    | L2PSHashTransaction
    | Web2Transaction
    | CrosschainTransaction
    | NativeTransaction
    | DemosworkTransaction
    | IdentityTransaction
    | InstantMessagingTransaction
    | L2PSInstantMessagingTransaction
    | NativeBridgeTransaction
    | StorageTransaction
    | StorageProgramTransaction
    | ContractDeployTransaction
    | ContractCallTransaction
    | D402PaymentTransaction
    | EscrowTransaction
    | IPFSTransaction
    // REVIEW: Token transaction types
    | TokenCreationTransaction
    | TokenExecutionTransaction
    | ValidatorStakeTransaction
    | ValidatorUnstakeTransaction
    | ValidatorExitTransaction
    | NetworkUpgradeTransaction
    | NetworkUpgradeVoteTransaction