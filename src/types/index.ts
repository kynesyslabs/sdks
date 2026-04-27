export {
    GenesisArtifact,
    GenesisImmutableProperties,
    GenesisMutableProperties,
    StandardGenesis,
    forkGenesis,
} from "./blockchain/genesisTypes"


export { Block, BlockContent, NativeTablesHashes, GenesisBlock } from "./blockchain/blocks"
//export { EncryptedTransaction } from "./blockchain/encryptedTransaction" // Obsolete - using new L2PS implementation
export { ISignature } from "./blockchain/ISignature"
export { RawTransaction } from "./blockchain/rawTransaction"
export {
    Transaction,
    TransactionContent,
    TransactionContentData,
} from "./blockchain/Transaction"

// REVIEW: Phase 9 - Custom charges for variable-cost operations
export {
    type CustomCharges,
    type IPFSCustomCharges,
    type IPFSCostBreakdown,
    type ValidityDataCustomCharges,
    hasIPFSCustomCharges,
    isValidCharge,
} from "./blockchain/CustomCharges"

// Export all specific transaction types
export {
    L2PSTransaction,
    Web2Transaction,
    CrosschainTransaction,
    NativeTransaction,
    DemosworkTransaction,
    IdentityTransaction,
    InstantMessagingTransaction,
    NativeBridgeTransaction,
    SpecificTransaction,
    // REVIEW: IPFS transaction types
    IPFSTransaction,
    type IPFSTransactionContent,
    type IPFSPayload,
    type IPFSAddPayload,
    type IPFSPinPayload,
    type IPFSUnpinPayload,
    // REVIEW: DEM-481 - Pin expiration extension
    type IPFSExtendPinPayload,
    type IPFSOperationType,
    isIPFSAddPayload,
    isIPFSPinPayload,
    isIPFSUnpinPayload,
    // REVIEW: DEM-481 - Pin expiration extension
    isIPFSExtendPinPayload,
    isIPFSPayload,
    // Validator staking (Phase 0 / upgradable_network)
    ValidatorStakeTransaction,
    ValidatorStakePayload,
    ValidatorUnstakeTransaction,
    ValidatorUnstakePayload,
    ValidatorExitTransaction,
    ValidatorExitPayload,
    // Stackable-genesis governance (Phase 1 / upgradable_network)
    NetworkUpgradeTransaction,
    NetworkUpgradePayload,
    NetworkUpgradeVoteTransaction,
    NetworkUpgradeVotePayload,
} from "./blockchain/TransactionSubtypes"

// L2PSEncryptedPayload removed to avoid circular dependency - import directly from @/l2ps

// SECTION Payload types
export { INativePayload } from "./native/INativePayload"
export { InstantMessagingPayload } from "./instantMessaging"

export { TxFee } from "./blockchain/TxFee"
export { CValidityData, ValidityData } from "./blockchain/ValidityData"
export { Bundle, BundleContent } from "./communication/transmit"

export { AddressInfo } from "./blockchain/addressInfo"
export { StatusNative } from "./blockchain/statusNative"
export { statusNative as StatusProperties } from "./blockchain/statusProperties"
export {
    StoredIdentities,
    Context,
    ProviderIdentities,
} from "./blockchain/identities"

export {
    Operation,
    OperationRegistrySlot,
    OperationResult,
} from "./gls/Operation"
export { StateChange } from "./gls/StateChange"
export {
    Account,
    AccountIdentities,
    XMIdentities,
    ChainIdentities,
    IdentityLink,
    Web2Identities,
    TwitterIdentity,
    AccountPoints,
    PointsBreakdown,
    Web3WalletPoints,
    SocialAccountPoints,
    ReferralInfo,
} from "./gls/account"

// network

export { ExecutionResult } from "./network/ExecutionResult"
export {
    ISecurityReport,
    SIComlink,
    SIResponseRegistry,
} from "./network/SecurityTypes"

// peer
export { IPeerConfig, IPeer } from "./peers/Peer"

// web2
export {
    IParam,
    IRawWeb2Request,
    IWeb2Request,
    IWeb2Payload,
    IWeb2Result,
    ISendHTTPRequestParams,
    IAuthorizationException,
    IAuthorizationConfig,
    IWeb2RequestOptions,
    IStartProxyParams,
    IDAHRStartProxyParams,
    Web2Method,
    EnumWeb2Actions,
} from "./web2"
export { TweetSimplified, Tweet, TwitterTimelineResponse, TwitterProfile, TwitterFollowersResponse } from "./web2/twitter"
export { 
    TelegramChallengeRequest, 
    TelegramChallengeResponse, 
    TelegramVerificationResponse, 
    TelegramUser, 
    TelegramVerificationRequest 
} from "./web2/telegram"
export { EthTransactionResponse, EthTransaction, SolanaTransactionResponse, SolTransaction } from "./xm/apiTools"

export { IOperation, ITask, XMScript } from "./xm"

// DemosWork
export { DemoScript } from "./demoswork"
export { DataTypes, operators } from "./demoswork/datatypes"
export {
    ConditionalOperationScript,
    DemosWorkOperationScripts,
    OperationScript,
    OperationType,
} from "./demoswork/operations"
export {
    ICondition,
    Conditional,
    StepOutputKey,
    WorkStepInput,
    XmStepResult,
    stepKeys,
    stepKeysEnum,
} from "./demoswork/steps"

export {
    BrowserRequest,
    ConsensusRequest,
    RPCRequest,
    RPCResponse,
    HelloPeerRequest,
    NodeCall,
    VoteRequest,
    RPCResponseWithValidityData,
    emptyResponse as RPCResponseSkeleton,
} from "./communication/rpc"

export {
    GCREdit,
    GCREditAssign,
    GCREditAssignIdentity,
    GCREditBalance,
    GCREditIdentity,
    GCREditNonce,
    GCREditSubnetsTx,
    GCREditStorageProgram,
    GCREditValidatorStake,
    GCREditNetworkUpgrade,
    GCREditNetworkUpgradeVote,
    Web2GCRData,
    XmGCRData,
    XmGCRIdentityData,
} from "./blockchain/GCREdit"
export {
    type ValidatorInfo,
    type ValidatorStatus,
} from "./validator/ValidatorTypes"
export {
    type NetworkParameters,
    type NetworkParameterKey,
    type NetworkUpgradeProposal,
    type ProposalStatus,
    type ProposalVoteInfo,
} from "./blockchain/NetworkParameters"
export { BridgeTradePayload } from "./bridge/bridgeTradePayload"
export {
    ChainProviders,
    SupportedChains,
    SupportedTokens,
} from "./bridge/constants"

export { type SigningAlgorithm, type EncryptionAlgorithm } from "./cryptography"
export {
    Ed25519SignedObject,
    PqcSignedObject,
    encryptedObject,
    SerializedEncryptedObject,
    SerializedSignedObject,
    signedObject,
} from "../encryption/unifiedCrypto"

// Export transaction utilities
export {
    isTransactionType,
    isTransactionDataType,
} from "./blockchain/TransactionSubtypes/utils"

// Export Unstoppable Domains multi-chain resolution types
export {
    type SignatureType,
    type UDNetwork,
    type UDRegistryType,
    type UDRecordKey,
    type SolanaRecordResult,
    type SolanaDomainResolution,
    type EVMDomainResolution,
    type SignableAddress,
    type UnifiedDomainResolution,
    type UDIdentityAssignPayload,
    type UDIdentityPayload,
    type UDResolutionConfig,
    type AddressTypeInfo,
} from "../abstraction/types/UDResolution"

// REVIEW: Token types for Demos Network tokens with scripting support
export {
    // Access Control
    type TokenPermission,
    type TokenACLEntry,
    type TokenAccessControl,
    // Metadata
    type TokenMetadata,
    // State
    type TokenBalances,
    type TokenAllowances,
    type TokenCustomState,
    type TokenState,
    // Script
    type TokenHookType,
    type TokenScriptMethod,
    type TokenScript,
    // Complete structure
    type TokenData,
    // Holder reference
    type TokenHolderReference,
    // Script execution
    type StateMutation,
    type ScriptContext,
    type ScriptExecutionResult,
    // Utility types
    type TokenCreationParams,
    type TokenQueryResult,
    type TokenBalanceResult,
    // REVIEW: Phase 4.1 - Script upgrade types
    type TokenUpgradePayload,
    type TokenUpgradeResult,
    type TokenUpgradeTransaction,
    // Utility functions
    deriveTokenAddress,
    computeScriptHash,
    serializeTokenData,
    deserializeTokenData,
    balanceToString,
    stringToBalance,
    createInitialTokenState,
    createInitialAccessControl,
    createTokenMetadata,
    createHolderReference,
    isValidTicker,
    isValidTokenName,
    isValidDecimals,
    isValidBalance,
    validateTokenCreationParams,
    applyMutations,
    hasPermission,
} from "./token"
