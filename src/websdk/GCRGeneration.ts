import {
    GCREdit,
    GCREditIdentity,
    GCREditBalance,
    GCREditNonce,
    GCREditAssign,
    Web2GCRData,
    XmGCRIdentityData,
} from "@/types/blockchain/GCREdit"
import { Transaction } from "@/types/blockchain/Transaction"
import { INativePayload } from "@/types/native"
import {
    IdentityPayload,
    InferFromSignaturePayload,
    Web2CoreTargetIdentityPayload,
} from "@/types/abstraction"
import { Hashing } from "@/encryption/Hashing"

/**
 * This class is responsible for generating the GCREdit for a transaction and is used
 * both in the client and the node.
 * Note that the node will be responsible for checking if the gas can be paid.
 */
export class GCRGeneration {
    static async generate(
        tx: Transaction,
        isRollback: boolean = false,
    ): Promise<GCREdit[]> {
        const gcrEdits: GCREdit[] = []
        const { content } = tx

        // Handle main transaction edits
        if (content.type) {
            switch (content.type) {
                case "demoswork":
                    // TODO Implement this
                    break
                case "native":
                    var nativeEdits = await HandleNativeOperations.handle(
                        tx,
                        isRollback,
                    )
                    gcrEdits.push(...nativeEdits)
                    break
                case "web2Request":
                case "crosschainOperation":
                    gcrEdits.push(this.createAssignEdit(content, tx.hash))
                    break
                case "genesis":
                    // TODO Implement this
                    break
                case "identity":
                    var identityEdits = await HandleIdentityOperations.handle(
                        tx,
                    )
                    gcrEdits.push(...identityEdits)
                    break
            }
        }

        // SECTION Operations valid for all tx types

        // Add gas operation edit with check for availability of gas amount in the sender's balance
        nonceEdits: try {
            // INFO: Skip gas for identity
            if (content.type === "identity") {
                break nonceEdits
            }

            let gasEdit = await this.createGasEdit(
                content.from as string,
                tx.hash,
            )
            gcrEdits.push(gasEdit)
        } catch (e) {
            console.log("[generate] Error creating gas edit: " + e)
            throw new Error("Error creating gas edit: " + e)
        }

        // Add nonce increment edit
        gcrEdits.push(this.createNonceEdit(content.from as string, tx.hash))
        return gcrEdits
    }

    public static async createGasEdit(
        account: string,
        txHash: string,
        isRollback: boolean = false,
    ): Promise<GCREdit> {
        var gasAmount = 1 // TODO Implement gas calculation to reach 1 cent per tx
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
        content: any,
        txHash: string,
        isRollback: boolean = false,
    ): GCREdit {
        return {
            type: "assign",
            account: content.from as string,
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
                console.log("to: ", to)
                console.log("amount: ", amount)
                var subtractEdit: GCREdit = {
                    type: "balance",
                    operation: "remove",
                    isRollback: isRollback,
                    account: tx.content.from as string, // ? Check and enforce string type as tx.content.from
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
            default:
                console.log(
                    "Unknown native operation: ",
                    nativePayload.nativeOperation,
                ) // TODO Better error handling
                // throw new Error("Unknown native operation: " + nativePayload.nativeOperation)
                break
        }
        return edits
    }
}

class Web2IdentityParsers {
    proof_url: string
    context: string

    constructor(proof_url: string, context: string) {
        this.proof_url = proof_url
        this.context = context
    }

    parseTwitterUsername(): string {
        // https://x.com/demos_xyz/status/1901630063692365884
        return this.proof_url.split("/")[3]
    }

    parseGithubUsername(): string {
        // https://gist.github.com/cwilvx/abf8db960c16dfc7f6dc1da840852f79
        return this.proof_url.split("/")[3]
    }

    parse(): string {
        switch (this.context) {
            case "twitter":
                return this.parseTwitterUsername()
            case "github":
                return this.parseGithubUsername()
            default:
                throw new Error("Unsupported context: " + this.context)
        }
    }
}

export class HandleIdentityOperations {
    static async handle(tx: Transaction): Promise<GCREditIdentity[]> {
        const edits = [] as GCREditIdentity[]

        const identityPayloadData: ["identity", IdentityPayload] = tx.content
            .data as ["identity", IdentityPayload]
        const identityPayload: IdentityPayload = identityPayloadData[1]

        // INFO: Create the GCR edit skeleton
        const edit: GCREditIdentity = {
            account: tx.content.from as string,
            type: "identity",
            operation: identityPayload.method.endsWith("assign")
                ? "add"
                : "remove",
            txhash: tx.hash,
            isRollback: false,
            context: identityPayload.context,
            data: null,
        }

        // INFO: Fill the GCR edit with the correct data
        switch (identityPayload.method) {
            case "xm_identity_assign": {
                // INFO: Fill in the identity data
                const payload = (
                    identityPayload.payload as InferFromSignaturePayload
                ).target_identity

                edit.data = {
                    chain: payload.chain,
                    subchain: payload.subchain,
                    targetAddress: payload.targetAddress,
                    isEVM: payload.isEVM,
                } as XmGCRIdentityData

                break
            }

            case "web2_identity_assign": {
                // INFO: Parse the web2 username from the proof url
                const payload =
                    identityPayload.payload as Web2CoreTargetIdentityPayload
                const parser = new Web2IdentityParsers(
                    payload.proof,
                    payload.context,
                )

                edit.data = {
                    context: payload.context,
                    data: {
                        username: parser.parse(),
                        proof: payload.proof,
                        proofHash: Hashing.sha256(payload.proof),
                    },
                } as Web2GCRData

                break
            }

            case "xm_identity_remove":
            case "web2_identity_remove": {
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
}
