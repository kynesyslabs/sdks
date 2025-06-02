// TODO Implement the identities abstraction
// This should be able to query and set the GCR identities for a Demos address

import { Cryptography } from "@/encryption/Cryptography"
import { RPCResponseWithValidityData, SigningAlgorithm } from "@/types"
import {
    XMCoreTargetIdentityPayload,
    Web2CoreTargetIdentityPayload,
    GithubProof,
    TwitterProof,
    InferFromGithubPayload,
    InferFromXPayload,
    InferFromSignaturePayload,
    PqcIdentityAssignPayload,
    PqcIdentityRemovePayload,
} from "@/types/abstraction"
import { DemosTransactions } from "@/websdk"
import { Demos } from "@/websdk/demosclass"
import { uint8ArrayToHex, UnifiedCrypto } from "@/encryption"

export default class Identities {
    formats = {
        web2: {
            github: [
                "https://gist.github.com",
                "https://raw.githubusercontent.com",
                "https://gist.githubusercontent.com",
            ],
            twitter: ["https://x.com", "https://twitter.com"],
        },
    }

    /**
     * Create a web2 proof payload for use with web2 identity inference.
     *
     * @param keypair The keypair of the demos account.
     * @returns The web2 proof payload string.
     */
    async createWeb2ProofPayload(demos: Demos) {
        const message = "dw2p"
        const signature = await demos.crypto.sign(
            demos.algorithm,
            new TextEncoder().encode(message),
        )

        return `demos:${message}:${demos.algorithm}:${uint8ArrayToHex(signature.signature)}`
    }

    /**
     * Infer an identity from either a crosschain payload or a web2 proof.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param context The context of the identity to infer.
     * @param payload The payload to infer the identity from.
     *
     * @returns The validity data of the identity transaction.
     */
    async inferIdentity(
        demos: Demos,
        context: "xm" | "web2" | "pqc",
        payload: any,
    ): Promise<RPCResponseWithValidityData> {
        if (context === "web2") {
            console.log
            if (
                !this.formats.web2[payload.context].some((format: string) =>
                    payload.proof.startsWith(format),
                )
            ) {
                // construct informative error message
                const errorMessage = `Invalid ${payload.context
                    } proof format. Supported formats are: ${this.formats.web2[
                        payload.context
                    ].join(", ")}`
                throw new Error(errorMessage)
            }
        }

        const tx = DemosTransactions.empty()
        const ed25519 = await demos.crypto.getIdentity("ed25519")
        const address = uint8ArrayToHex(ed25519.publicKey as Uint8Array)

        tx.content = {
            ...tx.content,
            type: "identity",
            to: address,
            amount: 0,
            data: [
                "identity",
                {
                    context: context,
                    method: (context + "_identity_assign") as any,
                    payload: payload,
                },
            ],
            nonce: 1,
            timestamp: Date.now(),
        }

        const signedTx = await demos.sign(tx)
        return await demos.confirm(signedTx)
    }

    /**
     * Remove a crosschain identity associated with an address.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param payload The payload to remove the identity from.
     * @returns The response from the RPC call.
     */
    async removeIdentity(
        demos: Demos,
        context: "xm" | "web2" | "pqc",
        payload: any,
    ): Promise<RPCResponseWithValidityData> {
        const tx = DemosTransactions.empty()

        const ed25519 = await demos.crypto.getIdentity("ed25519")
        const address = uint8ArrayToHex(ed25519.publicKey as Uint8Array)

        tx.content = {
            ...tx.content,
            type: "identity",
            to: address,
            amount: 0,
            data: [
                "identity",
                {
                    context: context,
                    method: (context + "_identity_remove") as any,
                    payload: payload,
                },
            ],
            nonce: 1,
            timestamp: Date.now(),
        }

        const signedTx = await demos.sign(tx)
        return await demos.confirm(signedTx)
    }

    /**
     * Infer a crosschain identity from a signature.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param payload The payload to infer the identity from.
     * @returns The validity data of the identity transaction.
     */
    async inferXmIdentity(demos: Demos, payload: InferFromSignaturePayload) {
        return await this.inferIdentity(demos, "xm", payload)
    }

    /**
     * Infer a web2 identity from a proof payload.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param payload The payload to infer the identity from.
     *
     * @returns The validity data of the identity transaction.
     */
    async inferWeb2Identity(
        demos: Demos,
        payload: Web2CoreTargetIdentityPayload,
    ) {
        return await this.inferIdentity(demos, "web2", payload)
    }

    /**
     * Remove a crosschain identity from the network.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param payload The payload to remove the identity.
     * @returns The response from the RPC call.
     */
    async removeXmIdentity(demos: Demos, payload: XMCoreTargetIdentityPayload) {
        return await this.removeIdentity(demos, "xm", payload)
    }

    /**
     * Remove a web2 identity from the network.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param payload The payload to remove the identity.
     * @returns The response from the RPC call.
     */
    async removeWeb2Identity(
        demos: Demos,
        payload: {
            context: string
            username: string
        },
    ) {
        return await this.removeIdentity(demos, "web2", payload)
    }

    /**
     * Add a github identity to the GCR.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param payload The payload to add the identity to.
     * @returns The response from the RPC call.
     */
    async addGithubIdentity(demos: Demos, payload: GithubProof) {
        let githubPayload: InferFromGithubPayload = {
            context: "github",
            proof: payload,
        }

        return await this.inferIdentity(demos, "web2", githubPayload)
    }

    /**
     * Add a twitter identity to the GCR.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param payload The payload to add the identity to.
     * @returns The response from the RPC call.
     */
    async addTwitterIdentity(demos: Demos, payload: TwitterProof) {
        let twitterPayload: InferFromXPayload = {
            context: "twitter",
            proof: payload,
        }

        return await this.inferIdentity(demos, "web2", twitterPayload)
    }

    // SECTION: PQC Identities
    async bindPqcIdentity(demos: Demos, algorithms: "all" | SigningAlgorithm[] = "all") {
        let ed25519Address: string = null
        let addressTypes: SigningAlgorithm[] = []

        // Get the ed25519 address (paylaod to be signed)
        const ed25519 = await demos.crypto.getIdentity("ed25519")
        ed25519Address = uint8ArrayToHex(ed25519.publicKey as Uint8Array)

        // Create the address types to bind
        if (algorithms === "all") {
            await demos.crypto.generateAllIdentities()
            addressTypes = UnifiedCrypto.supportedPQCAlgorithms
        } else {
            for (const algorithm of algorithms) {
                await demos.crypto.generateIdentity(algorithm)
                addressTypes.push(algorithm)
            }
        }

        // Create the payloads
        const payloads: PqcIdentityAssignPayload["payload"] = []

        for (const addressType of addressTypes) {
            // INFO: Create an ed25519 signature for each address type
            const keypair = await demos.crypto.getIdentity(addressType)
            const address = uint8ArrayToHex(keypair.publicKey as Uint8Array)
            const signature = await demos.crypto.sign("ed25519", new TextEncoder().encode(address))

            payloads.push({
                algorithm: addressType,
                address: address,
                signature: uint8ArrayToHex(signature.signature),
            })
        }

        return await this.inferIdentity(demos, "pqc", payloads)
    }

    async removePqcIdentity(demos: Demos, algorithms: "all" | SigningAlgorithm[] = "all") {
        let addressTypes: SigningAlgorithm[] = []

        // Create the address types to remove
        if (algorithms === "all") {
            await demos.crypto.generateAllIdentities()
            addressTypes = ["falcon", "ml-dsa"]
        } else {
            for (const algorithm of algorithms) {
                await demos.crypto.generateIdentity(algorithm)
                addressTypes.push(algorithm)
            }
        }

        // Create the payloads
        const payloads: PqcIdentityRemovePayload["payload"] = []

        for (const addressType of addressTypes) {
            const address = await demos.crypto.getIdentity(addressType)
            payloads.push({
                algorithm: addressType,
                address: uint8ArrayToHex(address.publicKey as Uint8Array),
            })
        }

        return await this.removeIdentity(demos, "pqc", payloads)
    }

    /**
     * Get the identities associated with an address.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param address The address to get identities for.
     * @returns The identities associated with the address.
     */
    async getIdentities(
        demos: Demos,
        call = "getIdentities",
        address?: string,
    ) {
        if (!address) {
            const ed25519 = await demos.crypto.getIdentity("ed25519")
            address = uint8ArrayToHex(ed25519.publicKey as Uint8Array)
        }

        const request = {
            method: "gcr_routine",
            params: [
                {
                    method: call,
                    params: [address],
                },
            ],
        }

        return await demos.rpcCall(request, true)
    }

    /**
     * Get the crosschain identities associated with an address.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param address The address to get identities for.
     * @returns The identities associated with the address.
     */
    async getXmIdentities(demos: Demos, address?: string) {
        return await this.getIdentities(demos, "getXmIdentities", address)
    }

    /**
     * Get the web2 identities associated with an address.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param address The address to get identities for.
     * @returns The identities associated with the address.
     */
    async getWeb2Identities(demos: Demos, address?: string) {
        return await this.getIdentities(demos, "getWeb2Identities", address)
    }
}
