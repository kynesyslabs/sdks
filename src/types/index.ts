import { XMPayload } from "./blockchain/Transaction"
import { XMScript, ITask, IOperation } from "./xm/index"

export {
    XMStep,
    Web2Step,
    NativeStep,
    demosStepType,
} from "./communication/demosWork"
export {
    demosStep,
    demosStepContent,
    demosWork,
} from "./communication/demosWork"

export {
    GenesisArtifact,
    GenesisImmutableProperties,
    GenesisMutableProperties,
    StandardGenesis,
    forkGenesis,
} from "./blockchain/genesisTypes"

export { ISignature } from "./blockchain/ISignature"
export { TxFee } from "./blockchain/TxFee"
export { CValidityData, ValidityData } from "./blockchain/ValidityData"
export { BlockContent, Block } from "./blockchain/blocks"
// ! Remove _ temporary exports here!
export {
    Transaction,
    TransactionContent,
    _TransactionContent,
    XMPayload,
    Web2Payload,
    NativePayload,
    StringifiedPayload,
} from "./blockchain/Transaction"
export { EncryptedTransaction } from "./blockchain/encryptedTransaction"
export { RawTransaction } from "./blockchain/rawTransaction"
export { Bundle, BundleContent } from "./communication/transmit"

export { AddressInfo } from "./blockchain/addressInfo"
export { StatusNative } from "./blockchain/statusNative"
export { statusNative as StatusProperties } from "./blockchain/statusProperties"

export {
    Operation,
    OperationRegistrySlot,
    OperationResult,
} from "./gls/Operation"
export { StateChange } from "./gls/StateChange"

// network

export { ExecutionResult } from "./network/ExecutionResult"
export {
    ISecurityReport,
    SIComlink,
    SIResponseRegistry,
} from "./network/SecurityTypes"

// peer
export { IPeerConfig } from "./peers/Peer"

// web2
export {
    IParam,
    IRawWeb2Request,
    IWeb2Attestation,
    IWeb2Payload,
    IWeb2Request,
    IWeb2Result,
} from "./web2"

export { XMScript, ITask, IOperation } from "./xm"

export {
    BrowserRequest,
    ConsensusRequest,
    RPCRequest,
    RPCResponse,
    HelloPeerRequest,
    NodeCall,
    VoteRequest,
    emptyResponse as RPCResponseSkeleton
} from "./communication/rpc"
