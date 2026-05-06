import {
    GCREdit,
    GCREditIdentity,
    GCREditStorageProgram,
    Web2TLSNGCRData,
    Web2GCRData,
} from "@/types/blockchain/GCREdit"
import {
    IdentityPayload,
    IdentityAttestationPayload,
    IdentityCommitmentPayload,
    InferFromSignaturePayload,
    TelegramSignedAttestation,
    Web2CoreTargetIdentityPayload,
    InferFromTLSNPayload,
} from "@/types/abstraction"
import { Hashing } from "@/encryption/Hashing"
import { INativePayload } from "@/types/native"
import { Transaction, TransactionContent } from "@/types/blockchain/Transaction"
import {
    StorageProgramPayload,
    STORAGE_PROGRAM_CONSTANTS,
} from "@/types/blockchain/TransactionSubtypes/StorageProgramTransaction"

/**
 * This class is responsible for generating the GCREdit for a transaction and is used
 * both in the client and the node.
 * Note that the node will be responsible for checking if the gas can be paid.
 */
export class GCRGeneration {
    // Fail-fast payload extractor — throws explicitly instead of silently
    // defaulting missing/wrong-typed fields, which can flip semantics
    // (e.g. a vote without `approve` would become an implicit reject).
    private static requirePayload<T>(
        content: TransactionContent,
        expectedType: TransactionContent["type"],
    ): T {
        const tuple = content.data as unknown
        if (
            !Array.isArray(tuple) ||
            tuple[0] !== expectedType ||
            tuple[1] == null ||
            typeof tuple[1] !== "object"
        ) {
            throw new Error(
                `[GCRGeneration] Invalid payload for ${expectedType} transaction`,
            )
        }
        return tuple[1] as T
    }

    static async generate(
        tx: Transaction,
        isRollback: boolean = false,
    ): Promise<GCREdit[]> {
        const gcrEdits: GCREdit[] = []
        const { content } = tx

        // Handle main transaction edits
        switch (content.type) {
            case "demoswork":
                // TODO Implement this
                break
            case "native": {
                var nativeEdits = await HandleNativeOperations.handle(
                    tx,
                    isRollback,
                )
                gcrEdits.push(...nativeEdits)
                break
            }
            case "web2Request":
            case "crosschainOperation":
                const assignEdit = this.createAssignEdit(content, tx.hash)
                gcrEdits.push(assignEdit)
                break
            case "genesis":
                // TODO Implement this
                break
            case "identity":
                var identityEdits = await HandleIdentityOperations.handle(tx)
                gcrEdits.push(...identityEdits)
                break
            case "d402_payment": {
                var d402Edits = await HandleD402Operations.handle(
                    tx,
                    isRollback,
                )
                gcrEdits.push(...d402Edits)
                break
            }
            // REVIEW: Storage Program operations - unified JSON/Binary storage with ACL
            case "storageProgram": {
                var storageProgramEdits = await HandleStorageProgramOperations.handle(
                    tx,
                    isRollback,
                )
                gcrEdits.push(...storageProgramEdits)
                break
            }
            // Phase 0 staking — synthesize a GCREditValidatorStake from
            // the tx payload. Server-side handleStakingTx still validates
            // policy (sender is validator, lock elapsed, etc.) but does
            // NOT mutate gcr_edits — this generator runs identically on
            // both sides so the hash comparison in handleValidateTransaction
            // matches.
            case "validatorStake": {
                const p = this.requirePayload<{
                    amount: string
                    connectionUrl: string
                }>(content, "validatorStake")
                if (typeof p.amount !== "string" || !/^\d+$/.test(p.amount)) {
                    throw new Error(
                        "[GCRGeneration] validatorStake.amount must be a non-negative bigint string",
                    )
                }
                if (typeof p.connectionUrl !== "string") {
                    throw new Error(
                        "[GCRGeneration] validatorStake.connectionUrl must be a string",
                    )
                }
                gcrEdits.push({
                    type: "validatorStake",
                    isRollback,
                    account: content.from_ed25519_address,
                    operation: "stake",
                    amount: p.amount,
                    connectionUrl: p.connectionUrl,
                    txhash: tx.hash,
                })
                break
            }
            case "validatorUnstake": {
                gcrEdits.push({
                    type: "validatorStake",
                    isRollback,
                    account: content.from_ed25519_address,
                    operation: "unstake",
                    amount: "0",
                    txhash: tx.hash,
                })
                break
            }
            case "validatorExit": {
                gcrEdits.push({
                    type: "validatorStake",
                    isRollback,
                    account: content.from_ed25519_address,
                    operation: "exit",
                    amount: "0",
                    txhash: tx.hash,
                })
                break
            }
            // Phase 1 governance — proposal + vote. Server-derived
            // fields (version, snapshotBlock, tallyBlock, weight,
            // blockNumber) are filled at apply time by
            // GCRNetworkUpgradeRoutines so the edit shape stays
            // deterministic from tx content alone.
            case "networkUpgrade": {
                const p = this.requirePayload<{
                    proposalId: string
                    proposedParameters: Record<string, unknown>
                    rationale: string
                    effectiveAtBlock: number
                }>(content, "networkUpgrade")
                if (typeof p.proposalId !== "string" || !p.proposalId) {
                    throw new Error(
                        "[GCRGeneration] networkUpgrade.proposalId must be a non-empty string",
                    )
                }
                if (
                    typeof p.proposedParameters !== "object" ||
                    p.proposedParameters === null ||
                    Array.isArray(p.proposedParameters)
                ) {
                    throw new Error(
                        "[GCRGeneration] networkUpgrade.proposedParameters must be a plain object",
                    )
                }
                if (typeof p.rationale !== "string") {
                    throw new Error(
                        "[GCRGeneration] networkUpgrade.rationale must be a string",
                    )
                }
                if (
                    typeof p.effectiveAtBlock !== "number" ||
                    !Number.isInteger(p.effectiveAtBlock) ||
                    p.effectiveAtBlock < 0
                ) {
                    throw new Error(
                        "[GCRGeneration] networkUpgrade.effectiveAtBlock must be a non-negative integer",
                    )
                }
                gcrEdits.push({
                    type: "networkUpgrade",
                    isRollback,
                    account: content.from_ed25519_address,
                    proposalId: p.proposalId,
                    proposedParameters: p.proposedParameters,
                    rationale: p.rationale,
                    effectiveAtBlock: p.effectiveAtBlock,
                    txhash: tx.hash,
                })
                break
            }
            case "networkUpgradeVote": {
                const p = this.requirePayload<{
                    proposalId: string
                    approve: boolean
                }>(content, "networkUpgradeVote")
                if (typeof p.proposalId !== "string" || !p.proposalId) {
                    throw new Error(
                        "[GCRGeneration] networkUpgradeVote.proposalId must be a non-empty string",
                    )
                }
                if (typeof p.approve !== "boolean") {
                    throw new Error(
                        "[GCRGeneration] networkUpgradeVote.approve must be a boolean",
                    )
                }
                gcrEdits.push({
                    type: "networkUpgradeVote",
                    isRollback,
                    account: content.from_ed25519_address,
                    proposalId: p.proposalId,
                    approve: p.approve,
                    txhash: tx.hash,
                })
                break
            }
        }

        // SECTION Operations valid for all tx types

        // Add gas operation edit with check for availability of gas amount in the sender's balance
        nonceEdits: try {
            // INFO: Skip gas for identity and D402 payments (gasless/sponsored transactions)
            if (
                content.type === "identity" ||
                content.type === "d402_payment"
            ) {
                break nonceEdits
            }

            var gasAmount = 1 // TODO Implement gas calculation to reach 1 cent per tx

            let gasEdit = await this.createGasEdit(
                content.from_ed25519_address,
                tx.hash,
                isRollback,
                gasAmount,
            )
            gcrEdits.push(gasEdit)
        } catch (e) {
            console.log("[generate] Error creating gas edit: " + e)
            throw new Error("Error creating gas edit: " + e)
        }

        // Add nonce increment edit
        gcrEdits.push(
            this.createNonceEdit(content.from_ed25519_address, tx.hash),
        )

        for (const edit of gcrEdits) {
            // Storage programs use 'target' instead of 'account'
            // Storage addresses use stor- prefix (not 0x), so skip prefix addition for them
            if (edit.type === "storageProgram") {
                // Storage addresses already have correct format: stor-{40 hex chars}
                // Do NOT add 0x prefix to storage targets
            } else if ("account" in edit && !edit.account.startsWith("0x")) {
                edit.account = "0x" + edit.account
            }
        }

        return gcrEdits
    }

    public static async createGasEdit(
        account: string,
        txHash: string,
        isRollback: boolean = false,
        gasAmount: number = 1,
    ): Promise<GCREdit> {
        // Checking if the gas can be paid is done in the node

        return {
            type: "balance",
            account,
            operation: isRollback ? "add" : "remove",
            amount: gasAmount,
            txhash: txHash,
            isRollback,
        }
    }

    /**
     * Creates an assignment edit for web2 requests and crosschain operations
     * @param content Transaction content containing type and sender information
     * @param txHash Transaction hash for verification
     * @param isRollback Whether the operation is a rollback
     * @returns GCREdit object for assignment operations
     */
    private static createAssignEdit(
        content: TransactionContent,
        txHash: string,
        isRollback: boolean = false,
    ): GCREdit {
        return {
            type: "assign",
            account: content.from_ed25519_address,
            context: content.type === "web2Request" ? "web2" : "xm",
            txhash: txHash,
            isRollback,
        }
    }

    /**
     * Creates a nonce increment edit for the given account
     * @param account The account address to increment nonce for
     * @param txHash Transaction hash for verification
     * @param isRollback Whether the operation is a rollback
     * @returns GCREdit object for nonce increment
     */
    private static createNonceEdit(
        account: string,
        txHash: string,
        isRollback: boolean = false,
    ): GCREdit {
        return {
            type: "nonce",
            operation: "add",
            account,
            amount: 1,
            txhash: txHash,
            isRollback,
        }
    }
}

/**
 * This class is responsible for handling native operations when generating the GCREdit
 * for a transaction.
 * While it could be implemented in the GCRGeneration class, it is separated to
 * make the GCRGeneration class cleaner and to allow for more flexibility in the future.
 */
export class HandleNativeOperations {
    static async handle(
        tx: Transaction,
        isRollback: boolean = false,
    ): Promise<GCREdit[]> {
        // TODO Implement this
        let edits: GCREdit[] = []
        console.log("handleNativeOperations: ", tx.content.type)
        let nativePayloadData: ["native", INativePayload] = tx.content.data as [
            "native",
            INativePayload,
        ] // ? Is this typization correct and safe?
        let nativePayload: INativePayload = nativePayloadData[1]
        console.log("nativePayload: ", nativePayload)
        console.log("nativeOperation: ", nativePayload.nativeOperation)
        // Switching on the native operation type
        switch (nativePayload.nativeOperation) {
            // Balance operations for the send native method
            case "send":
                var [to, amount] = nativePayload.args

                // First, remove the amount from the sender's balance
                var subtractEdit: GCREdit = {
                    type: "balance",
                    operation: "remove",
                    isRollback: isRollback,
                    account: tx.content.from_ed25519_address,
                    txhash: tx.hash,
                    amount: amount,
                }
                edits.push(subtractEdit)
                // Then, add the amount to the receiver's balance
                var addEdit: GCREdit = {
                    type: "balance",
                    operation: "add",
                    isRollback: isRollback,
                    account: to,
                    txhash: tx.hash,
                    amount: amount,
                }
                edits.push(addEdit)
                break

            // TLSNotary attestation request - burns 1 DEM fee
            // Token creation is handled by the node, SDK only generates the balance edit
            case "tlsn_request": {
                const TLSN_REQUEST_FEE = 1
                var burnFeeEdit: GCREdit = {
                    type: "balance",
                    operation: "remove",
                    isRollback: isRollback,
                    account: tx.content.from_ed25519_address,
                    txhash: tx.hash,
                    amount: TLSN_REQUEST_FEE,
                }
                edits.push(burnFeeEdit)
                break
            }

            // TLSNotary proof storage - burns fee based on size
            // Actual storage is handled by the node
            case "tlsn_store": {
                const [, proof] = nativePayload.args
                const TLSN_STORE_BASE_FEE = 1
                const TLSN_STORE_PER_KB_FEE = 1
                const proofSizeKB = Math.ceil(proof.length / 1024)
                const storageFee = TLSN_STORE_BASE_FEE + (proofSizeKB * TLSN_STORE_PER_KB_FEE)
                var burnStorageFeeEdit: GCREdit = {
                    type: "balance",
                    operation: "remove",
                    isRollback: isRollback,
                    account: tx.content.from_ed25519_address,
                    txhash: tx.hash,
                    amount: storageFee,
                }
                edits.push(burnStorageFeeEdit)
                break
            }

            default: {
                // Exhaustive check - if this is reached, a new operation was added without handling
                const _exhaustiveCheck: never = nativePayload
                console.log(
                    "Unknown native operation: ",
                    (_exhaustiveCheck as INativePayload).nativeOperation,
                )
                break
            }
        }
        return edits
    }
}

export class HandleIdentityOperations {
    static async handle(tx: Transaction): Promise<GCREditIdentity[]> {
        const edits = [] as GCREditIdentity[]

        const identityPayloadData: ["identity", IdentityPayload] = tx.content
            .data as ["identity", IdentityPayload]
        const identityPayload: IdentityPayload = identityPayloadData[1]
        const operation = this.getIdentityOperation(identityPayload.method)

        // INFO: Create the GCR edit skeleton
        const edit: GCREditIdentity = {
            account: tx.content.from_ed25519_address,
            type: "identity",
            operation,
            txhash: tx.hash,
            isRollback: false,
            context: identityPayload.context,
            data: null,
            referralCode: null,
        }

        // INFO: Fill the GCR edit with the correct data
        switch (identityPayload.method) {
            case "xm_identity_assign": {
                // INFO: Fill in the identity data
                const payload = (
                    identityPayload.payload as InferFromSignaturePayload
                ).target_identity

                if (payload.isEVM && !payload.chainId) {
                    throw new Error("Failed: chainId not provided")
                }

                // REVIEW: Remove the signed Message from the edit data
                // This is supposed to be the ed25519 address and should be provided by the caller
                const data = structuredClone(payload)

                edit.data = {
                    ...data,
                    timestamp: tx.content.timestamp,
                }
                edit.referralCode = identityPayload.payload.referralCode
                break
            }

            case "pqc_identity_assign": {
                edit.data = identityPayload.payload.map(payload => {
                    return {
                        ...payload,
                        timestamp: tx.content.timestamp,
                    }
                })
                break
            }

            case "web2_identity_assign": {
                // INFO: Parse the web2 username from the proof url
                const payload =
                    identityPayload.payload as Web2CoreTargetIdentityPayload

                const proofString =
                    typeof payload.proof === "string"
                        ? payload.proof
                        : JSON.stringify(payload.proof)

                edit.data = {
                    context: payload.context,
                    data: {
                        username: payload.username,
                        userId: payload.userId,
                        proof: payload.proof,
                        proofHash: Hashing.sha256(proofString),
                        timestamp: tx.content.timestamp,
                    },
                } as Web2GCRData
                edit.referralCode = identityPayload.payload.referralCode

                // INFO: Telegram payload is sent by bot, replace edit account
                if (payload.context === "telegram") {
                    edit.account = (
                        payload.proof as TelegramSignedAttestation
                    ).payload.public_key
                }

                break
            }

            case "ud_identity_assign": {
                edit.data = {
                    ...identityPayload.payload,
                    timestamp: tx.content.timestamp,
                }
                break
            }

            case "nomis_identity_assign": {
                edit.data = identityPayload.payload
                break
            }

            case "humanpassport_identity_assign": {
                edit.data = identityPayload.payload
                edit.referralCode = identityPayload.payload.referralCode
                break
            }

            case "ethos_identity_assign": {
                edit.data = identityPayload.payload
                break
            }

            case "tlsn_identity_assign": {
                // TLSN identity uses TLSNotary proof for verification
                // The proof contains cryptographically verified data from the target API
                const payload = identityPayload.payload as InferFromTLSNPayload

                // Stringify the proof for storage
                const proofString = JSON.stringify(payload.proof)

                const tlsnData: Web2TLSNGCRData = {
                    context: payload.context,
                    data: {
                        username: payload.username,
                        userId: payload.userId,
                        proof: proofString,
                        proofHash: Hashing.sha256(proofString),
                        recvHash: payload.recvHash,
                        proofRanges: payload.proofRanges,
                        revealedRecv: payload.revealedRecv,
                        timestamp: tx.content.timestamp,
                    },
                }
                edit.data = tlsnData
                edit.referralCode = payload.referralCode
                break
            }

            case "zk_commitmentadd": {
                edit.data = (
                    identityPayload.payload as IdentityCommitmentPayload[]
                ).map(payload => ({
                    ...payload,
                    timestamp: payload.timestamp ?? tx.content.timestamp,
                }))
                break
            }

            case "zk_attestationadd": {
                edit.data = (
                    identityPayload.payload as IdentityAttestationPayload[]
                ).map(payload => ({
                    ...payload,
                }))
                break
            }

            case "xm_identity_remove":
            case "web2_identity_remove":
            case "pqc_identity_remove":
            case "ud_identity_remove":
            case "nomis_identity_remove":
            case "humanpassport_identity_remove":
            case "ethos_identity_remove":
            case "tlsn_identity_remove": {
                // INFO: Passthrough the payload
                edit.data = identityPayload.payload as any
                break
            }

            default:
                console.log(
                    "Unknown identity operation: ",
                    // @ts-ignore
                    identityPayload.method,
                )
                break
        }

        edits.push(edit)

        return edits
    }

    private static getIdentityOperation(
        method: IdentityPayload["method"],
    ): GCREditIdentity["operation"] {
        switch (method) {
            case "zk_commitmentadd":
            case "zk_attestationadd":
                return method
            case "xm_identity_assign":
            case "web2_identity_assign":
            case "pqc_identity_assign":
            case "ud_identity_assign":
            case "nomis_identity_assign":
            case "humanpassport_identity_assign":
            case "ethos_identity_assign":
            case "tlsn_identity_assign":
                return "add"
            case "xm_identity_remove":
            case "web2_identity_remove":
            case "pqc_identity_remove":
            case "ud_identity_remove":
            case "nomis_identity_remove":
            case "humanpassport_identity_remove":
            case "ethos_identity_remove":
            case "tlsn_identity_remove":
                return "remove"
            default: {
                const _exhaustiveCheck: never = method
                throw new Error(
                    `Unknown identity operation: ${_exhaustiveCheck as string}`,
                )
            }
        }
    }
}

/**
 * This class is responsible for handling D402 payment operations when generating the GCREdit
 * for a transaction.
 * D402 payments are gasless (sponsored) and transfer DEM from buyer to seller.
 */
export class HandleD402Operations {
    static async handle(
        tx: Transaction,
        isRollback: boolean = false,
    ): Promise<GCREdit[]> {
        const edits: GCREdit[] = []

        // Import the D402PaymentPayload type at runtime
        const d402PayloadData: ["d402_payment", any] = tx.content.data as [
            "d402_payment",
            any,
        ]
        const d402Payload = d402PayloadData[1]

        const { to, amount } = d402Payload

        // Remove amount from sender's balance
        const subtractEdit: GCREdit = {
            type: "balance",
            operation: "remove",
            isRollback: isRollback,
            account: tx.content.from_ed25519_address,
            txhash: tx.hash,
            amount: amount,
        }
        edits.push(subtractEdit)

        // Add amount to recipient's balance
        const addEdit: GCREdit = {
            type: "balance",
            operation: "add",
            isRollback: isRollback,
            account: to,
            txhash: tx.hash,
            amount: amount,
        }
        edits.push(addEdit)

        return edits
    }
}

// REVIEW: Storage Program operations handler for GCR edit generation
/**
 * This class is responsible for handling Storage Program operations when generating
 * the GCREdit for a transaction.
 *
 * Storage Program features:
 * - Unified JSON/Binary storage with robust ACL
 * - 1MB max size, 1 DEM per 10KB pricing
 * - Permanent storage, owner/ACL-deletable only
 *
 * Operations:
 * - CREATE_STORAGE_PROGRAM: Creates storage + burns fee
 * - WRITE_STORAGE: Updates storage + burns additional fee based on size delta
 * - UPDATE_ACCESS_CONTROL: Updates ACL (no fee)
 * - DELETE_STORAGE_PROGRAM: Soft deletes (no fee)
 */
export class HandleStorageProgramOperations {
    /**
     * Calculate the storage fee based on data size
     * Pricing: 1 DEM per 10KB (rounded up)
     */
    private static calculateStorageFee(data: Record<string, any> | string | undefined, encoding: "json" | "binary" = "json"): number {
        if (!data) return 1 // Minimum 1 DEM

        let sizeBytes: number
        if (encoding === "binary") {
            // Binary: base64 string, decode to get actual bytes
            const base64String = data as string
            sizeBytes = Math.ceil((base64String.length * 3) / 4)
        } else {
            // JSON: stringify and count bytes
            const jsonString = JSON.stringify(data)
            sizeBytes = new TextEncoder().encode(jsonString).length
        }

        const chunks = Math.ceil(sizeBytes / STORAGE_PROGRAM_CONSTANTS.PRICING_CHUNK_BYTES)
        // FEE_PER_CHUNK is bigint in constants, convert to number for GCREdit compatibility
        const feePerChunk = Number(STORAGE_PROGRAM_CONSTANTS.FEE_PER_CHUNK)
        return Math.max(1, chunks) * feePerChunk
    }

    static async handle(
        tx: Transaction,
        isRollback: boolean = false,
    ): Promise<GCREdit[]> {
        const edits: GCREdit[] = []

        // Parse storage program payload from transaction
        const storageProgramPayloadData: ["storageProgram", StorageProgramPayload] =
            tx.content.data as ["storageProgram", StorageProgramPayload]
        const payload: StorageProgramPayload = storageProgramPayloadData[1]

        const { operation, storageAddress, encoding = "json", data } = payload

        switch (operation) {
            case "CREATE_STORAGE_PROGRAM": {
                // Calculate and burn the storage fee
                const fee = this.calculateStorageFee(data, encoding)

                const burnFeeEdit: GCREdit = {
                    type: "balance",
                    operation: "remove",
                    isRollback: isRollback,
                    account: tx.content.from_ed25519_address,
                    txhash: tx.hash,
                    amount: fee,
                }
                edits.push(burnFeeEdit)

                // Create the storage program edit
                const createEdit: GCREditStorageProgram = {
                    type: "storageProgram",
                    target: storageAddress,
                    isRollback: isRollback,
                    txhash: tx.hash,
                    context: {
                        operation: "CREATE_STORAGE_PROGRAM",
                        sender: tx.content.from_ed25519_address,
                        data: {
                            variables: payload,
                            metadata: payload.metadata || null,
                        },
                    },
                }
                edits.push(createEdit)
                break
            }

            case "WRITE_STORAGE": {
                // Calculate and burn the storage fee for the new data
                const fee = this.calculateStorageFee(data, encoding)

                const burnFeeEdit: GCREdit = {
                    type: "balance",
                    operation: "remove",
                    isRollback: isRollback,
                    account: tx.content.from_ed25519_address,
                    txhash: tx.hash,
                    amount: fee,
                }
                edits.push(burnFeeEdit)

                // Create the write storage edit
                const writeEdit: GCREditStorageProgram = {
                    type: "storageProgram",
                    target: storageAddress,
                    isRollback: isRollback,
                    txhash: tx.hash,
                    context: {
                        operation: "WRITE_STORAGE",
                        sender: tx.content.from_ed25519_address,
                        data: {
                            variables: payload,
                            metadata: payload.metadata || null,
                        },
                    },
                }
                edits.push(writeEdit)
                break
            }

            case "UPDATE_ACCESS_CONTROL": {
                // No fee for ACL updates
                const aclEdit: GCREditStorageProgram = {
                    type: "storageProgram",
                    target: storageAddress,
                    isRollback: isRollback,
                    txhash: tx.hash,
                    context: {
                        operation: "UPDATE_ACCESS_CONTROL",
                        sender: tx.content.from_ed25519_address,
                        data: {
                            variables: payload,
                            metadata: null,
                        },
                    },
                }
                edits.push(aclEdit)
                break
            }

            case "DELETE_STORAGE_PROGRAM": {
                // No fee for deletions
                const deleteEdit: GCREditStorageProgram = {
                    type: "storageProgram",
                    target: storageAddress,
                    isRollback: isRollback,
                    txhash: tx.hash,
                    context: {
                        operation: "DELETE_STORAGE_PROGRAM",
                        sender: tx.content.from_ed25519_address,
                        data: {
                            variables: payload,
                            metadata: null,
                        },
                    },
                }
                edits.push(deleteEdit)
                break
            }

            case "READ_STORAGE": {
                // READ operations don't generate edits - they're handled via RPC
                // This case is here for completeness
                console.log("[StorageProgram] READ_STORAGE is handled via RPC, not transactions")
                break
            }

            default: {
                console.log("[StorageProgram] Unknown operation:", operation)
                break
            }
        }

        return edits
    }
}
