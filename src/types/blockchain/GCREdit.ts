// TODO See handleGCR.ts for the execution of the GCREdit
// TODO See endpointHandlers.ts for the derivation of the GCREdit from a Transaction (see handleExecuteTransaction)

import {
    IdentityAttestationPayload,
    IdentityCommitmentPayload,
    PqcIdentityRemovePayload,
    UDIdentityPayload,
    XMCoreTargetIdentityPayload,
    NomisWalletIdentity,
    HumanPassportIdentityData,
    EthosWalletIdentity,
    TLSNIdentityContext,
    TLSNProofRanges,
} from "../abstraction"
import { SigningAlgorithm } from "../cryptography"

/**
 * Balance-mutation GCR edit — adds to or subtracts from a sender/receiver
 * balance, or burns a fee.
 *
 * Wire-format compatibility (P4): `amount` may be either a JS `number`
 * (pre-fork node, DEM) or a decimal `string` in OS (post-fork node). The
 * SDK's `GCRGeneration` populates the field with whichever shape matches
 * the connected node's fork status.
 *
 * Important: the node's post-fork serializer (`forks/serializerGate.ts`)
 * does **not** re-encode `gcr_edits[].amount`. Whatever the SDK puts here
 * **is** the wire format and contributes directly to the transaction
 * hash. Construction-site correctness is the contract.
 */
export interface GCREditBalance {
    type: "balance"
    isRollback: boolean
    operation: "add" | "remove"
    account: string
    amount: number | string
    txhash: string
}
/**
 * Nonce-increment GCR edit. `amount` is a counter delta, not a token
 * amount — always `1` in current code. Kept as `number` because the fork
 * does not change its encoding. Do **not** confuse with `GCREditBalance.amount`.
 */
export interface GCREditNonce {
    type: "nonce"
    isRollback: boolean
    operation: "add" | "remove"
    account: string
    amount: number
    txhash: string
}

export interface GCREditAssign {
    type: "assign"
    isRollback: boolean
    account: string
    context: "native" | "web2" | "xm"
    txhash: string
}

export interface GCREditAssignIdentity {
    type: "identity"
    isRollback: boolean
    account: string
    identity: any // TODO Define the type of the identity change object based on StoredIdentities
    txhash: string
}

export interface GCREditSubnetsTx {
    type: "subnetsTx"
    isRollback: boolean
    account: string
    txhash: string
    // ! Compile this based on node/src/model/entities/GCR/GCRSubnetsTxs.ts
}

export interface XmGCRData {
    chain: string
    subchain: string
    identity: string
}

export interface XmGCRIdentityData {
    chain: string
    subchain: string
    targetAddress: string
    signature: string
    publicKey: string
    isEVM: boolean
    timestamp: number
}

export interface Web2GCRData {
    context: string
    data: {
        username: string
        proof: string
        proofHash: string
        userId: string
        timestamp: number
    }
}

export interface Web2TLSNGCRData {
    context: TLSNIdentityContext
    data: {
        username: string
        proof: string
        proofHash: string
        userId: string
        recvHash: string
        proofRanges: TLSNProofRanges
        revealedRecv: number[]
        timestamp: number
    }
}

export interface PQCIdentityGCREditData {
    algorithm: SigningAlgorithm
    address: string
    signature: string
    timestamp: number
}

export type UdGCRData = UDIdentityPayload
export type ZkCommitmentGCRData = IdentityCommitmentPayload
export type ZkAttestationGCRData = IdentityAttestationPayload


export interface GCREditIdentity {
    type: "identity"
    isRollback: boolean
    account: string
    context: "xm" | "web2" | "pqc" | "nomis" | "ud" | "humanpassport" | "ethos" | "tlsn" | "zk"
    operation: "add" | "remove" | "zk_commitmentadd" | "zk_attestationadd"
    data:
    | Web2GCRData // web2 add or remove identity
    | Web2TLSNGCRData // tlsn add identity
    | XmGCRIdentityData // xm add identity
    | XMCoreTargetIdentityPayload // xm remove identity
    | PQCIdentityGCREditData[] // pqc add identity
    | PqcIdentityRemovePayload["payload"] // pqc remove identity
    | UdGCRData // ud add identity
    | { domain: string } // ud remove identity
    | NomisWalletIdentity // nomis add/remove identity
    | HumanPassportIdentityData // humanpassport add identity
    | { address: string } // humanpassport remove identity
    | EthosWalletIdentity // ethos add/remove identity
    | ZkCommitmentGCRData[] // zk commitment add identity
    | ZkAttestationGCRData[] // zk attestation add identity
    txhash: string
    referralCode?: string
}

export interface GCREditSmartContract {
    type: "smartContract"
    operation: "deploy" | "call" | "store" | "retrieve"
    account: string           // Contract address
    txhash: string
    isRollback: boolean

    // Deploy-specific fields
    code?: string
    deployer?: string

    // Call-specific fields
    method?: string
    args?: any[]

    // State-specific fields
    key?: string
    value?: any

    // Results
    result?: any
    gasUsed?: number
}

export interface GCREditStorageProgram {
    type: "storageProgram"
    target: string              // Storage program address
    isRollback: boolean
    txhash: string
    context: {
        operation: string       // CREATE, WRITE, DELETE, UPDATE_ACCESS_CONTROL
        sender: string          // Transaction sender
        data?: {                // Optional for DELETE operations
            variables: any      // Key-value storage data
            metadata: any       // Program metadata (deployer, accessControl, etc.)
        }
    }
}

/**
 * Escrow GCR edit operation
 * Enables trustless escrow to social identities (Twitter, GitHub, Telegram)
 */
export interface GCREditEscrow {
    type: "escrow"
    operation: "deposit" | "claim" | "refund"
    account: string  // Escrow address (for deposit/claim) or refunder address
    data: {
        // Deposit fields
        sender?: string           // Ed25519 pubkey of sender
        platform?: "twitter" | "github" | "telegram"
        username?: string         // Social username (e.g., "@bob")
        /**
         * Escrow deposit amount. Wire format follows the same pre-fork /
         * post-fork rule as `GCREditBalance.amount`: `number` DEM
         * pre-fork, decimal `string` OS post-fork.
         */
        amount?: number | string
        expiryDays?: number       // Optional, default 30
        message?: string          // Optional memo

        // Claim fields
        claimant?: string         // Ed25519 pubkey of claimant
        claimed?: boolean         // Whether escrow has been claimed
        claimedBy?: string        // Address that claimed the escrow
        claimedAt?: number        // Timestamp when claimed

        // Refund fields
        refunder?: string         // Ed25519 pubkey of refunder
    }
    txhash: string
    isRollback: boolean
}

/**
 * TLSNotary attestation storage GCR edit
 */
export interface GCREditTLSNotary {
    type: "tlsnotary"
    operation: "store"
    account: string
    data: {
        tokenId: string
        domain: string
        proof: string          // Full proof or IPFS hash
        storageType: "onchain" | "ipfs"
        timestamp: number
    }
    txhash: string
    isRollback: boolean
}

/**
 * Validator-staking GCR edit. Emitted by validatorStake / validatorUnstake /
 * validatorExit transactions. Applied against the Validators table.
 */
export interface GCREditValidatorStake {
    type: "validatorStake"
    isRollback: boolean
    account: string                  // validator ed25519 pubkey hex
    operation: "stake" | "unstake" | "exit"
    amount: string                   // bigint-as-string; "0" for unstake/exit
    connectionUrl?: string           // only meaningful for the initial stake
    txhash: string
}

/**
 * Stackable-genesis governance GCR edit — proposal lifecycle.
 * Emitted by `networkUpgrade` transactions. Applied to the
 * `network_upgrades` table at block-confirmation time on every node.
 *
 * Carries only client-derivable fields. Server-derived fields
 * (`version`, `snapshotBlock`, `tallyBlock`) are filled at apply time
 * by `GCRNetworkUpgradeRoutines.applyProposal` so the edit hash is
 * deterministic from tx content alone (matches between SDK
 * `GCRGeneration.generate()` and node-side `handleValidateTransaction`
 * comparison).
 */
export interface GCREditNetworkUpgrade {
    type: "networkUpgrade"
    isRollback: boolean
    account: string                  // proposer ed25519 pubkey hex
    proposalId: string
    proposedParameters: Record<string, unknown>  // Partial<NetworkParameters>
    rationale: string
    effectiveAtBlock: number
    txhash: string
}

/**
 * Stackable-genesis governance GCR edit — vote.
 * Emitted by `networkUpgradeVote` transactions. Applied to the
 * `network_upgrade_votes` table at block-confirmation time on every node.
 *
 * `weight` and `blockNumber` are server-derived at apply time —
 * voter's snapshotted staked amount + the block number being confirmed.
 * Keeping them out of the signed edit means the edit hash is
 * deterministic from tx content alone and matches across SDK + server.
 */
export interface GCREditNetworkUpgradeVote {
    type: "networkUpgradeVote"
    isRollback: boolean
    account: string                  // voter ed25519 pubkey hex
    proposalId: string
    approve: boolean
    txhash: string
}

export type GCREdit =
    | GCREditBalance
    | GCREditNonce
    | GCREditAssign
    | GCREditAssignIdentity
    | GCREditSubnetsTx
    | GCREditIdentity
    | GCREditSmartContract
    | GCREditStorageProgram
    | GCREditEscrow
    | GCREditTLSNotary
    | GCREditValidatorStake
    | GCREditNetworkUpgrade
    | GCREditNetworkUpgradeVote
