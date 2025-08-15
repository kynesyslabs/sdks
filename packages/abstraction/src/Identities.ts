// TODO Implement the identities abstraction
// This should be able to query and set the GCR identities for a Demos address

import axios from "axios"
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
} from "@kynesyslabs/types"
import { PQCAlgorithm } from "@kynesyslabs/types"
import { RPCResponseWithValidityData } from "@kynesyslabs/types"

import { UnifiedCrypto } from "@kynesyslabs/encryption"
import { uint8ArrayToHex, required } from "@kynesyslabs/utils"
import { Demos, DemosTransactions } from "@kynesyslabs/websdk"

export class Identities {
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
    private async inferIdentity(
        demos: Demos,
        context: "xm" | "web2" | "pqc",
        payload: any,
    ): Promise<RPCResponseWithValidityData> {
        if (context === "web2") {
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
    private async removeIdentity(
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
    async inferXmIdentity(demos: Demos, payload: InferFromSignaturePayload, referralCode?: string) {
        return await this.inferIdentity(demos, "xm", { ...payload, referralCode: referralCode })
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
    async addGithubIdentity(demos: Demos, payload: GithubProof, referralCode?: string) {
        const username = payload.split("/")[3]
        const ghUser = await axios.get(`https://api.github.com/users/${username}`)

        if (!ghUser.data.login) {
            throw new Error("Failed to get github user")
        }

        let githubPayload: InferFromGithubPayload = {
            context: "github",
            proof: payload,
            username: ghUser.data.login,
            userId: ghUser.data.id,
            referralCode: referralCode,
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
    async addTwitterIdentity(demos: Demos, payload: TwitterProof, referralCode?: string) {
        const data = await demos.web2.getTweet(payload)

        if (!data.success) {
            throw new Error(data.error)
        }

        if (!data.tweet.userId || !data.tweet.username) {
            throw new Error("Unable to get twitter user info. Please try again.")
        }

        let twitterPayload: InferFromXPayload = {
            context: "twitter",
            proof: payload,
            username: data.tweet.username,
            userId: data.tweet.userId,
            referralCode: referralCode,
        }

        return await this.inferIdentity(demos, "web2", twitterPayload)
    }

    // SECTION: PQC Identities
    async bindPqcIdentity(demos: Demos, algorithms: "all" | PQCAlgorithm[] = "all") {
        let addressTypes: PQCAlgorithm[] = []

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

    async removePqcIdentity(demos: Demos, algorithms: "all" | PQCAlgorithm[] = "all") {
        let addressTypes: PQCAlgorithm[] = []

        // Create the address types to remove
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

    /**
     * Get the points associated with an identity
     *
     * @param demos A Demos instance to communicate with the RPC
     * @param address The address to get points for. Defaults to the connected wallet's address.
     * @returns The points data for the identity
     */
    async getUserPoints(demos: Demos, address?: string): Promise<RPCResponseWithValidityData> {
        required(address || demos.walletConnected, "No address provided and no wallet connected")

        if (!address) {
            address = await demos.getEd25519Address()
        }

        const request = {
            method: "gcr_routine",
            params: [
                {
                    method: "getPoints",
                    params: [address],
                },
            ],
        }

        return await demos.rpcCall(request, true)
    }

    /**
     * Validate a referral code to check if it exists and is valid.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param referralCode The referral code to validate.
     * @returns The validation result containing validity status, referrer public key, and message.
     */
    async validateReferralCode(demos: Demos, referralCode: string) {
        const request = {
            method: "gcr_routine",
            params: [
                { method: "validateReferralCode", params: [referralCode] },
            ],
        }

        return await demos.rpcCall(request, true)
    }

    /**
     * Get referral information for an address.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param address The address to get referral info for. Defaults to the connected wallet's address.
     * @returns The referral information associated with the address.
     */
    async getReferralInfo(demos: Demos, address?: string) {
        if (!address) {
            address = await demos.getEd25519Address()
        }

        const request = {
            method: "gcr_routine",
            params: [
                { method: "getReferralInfo", params: [address] },
            ],
        }

        return await demos.rpcCall(request, true)
    }
}
