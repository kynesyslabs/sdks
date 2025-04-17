// TODO Implement the identities abstraction
// This should be able to query and set the GCR identities for a Demos address

import { Cryptography } from "@/encryption/Cryptography"
import { RPCResponseWithValidityData } from "@/types"
import {
    XMCoreTargetIdentityPayload,
    Web2CoreTargetIdentityPayload,
    GithubProof,
    TwitterProof,
    InferFromGithubPayload,
    InferFromXPayload,
    InferFromSignaturePayload,
} from "@/types/abstraction"
import forge from "node-forge"
import { DemosTransactions } from "@/websdk"
import { Demos } from "@/websdk/demosclass"
import { IKeyPair } from "@/websdk/types/KeyPair"

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
    async createWeb2ProofPayload(keypair: IKeyPair) {
        const message = "dw2p"
        const signature = Cryptography.sign(message, keypair.privateKey)
        const payload = {
            message,
            signature: signature.toString("hex"),
            publicKey: keypair.publicKey.toString("hex"),
        }

        const verified = Cryptography.verify(
            message,
            forge.util.binary.hex.decode(payload.signature),
            forge.util.binary.hex.decode(payload.publicKey),
        )

        if (!verified) {
            throw new Error("Failed to verify web2 proof payload")
        }

        return `demos:${payload.message}:${payload.signature}:${payload.publicKey}`
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
        context: "xm" | "web2",
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
                const errorMessage = `Invalid ${
                    payload.context
                } proof format. Supported formats are: ${this.formats.web2[
                    payload.context
                ].join(", ")}`
                throw new Error(errorMessage)
            }
        }

        const tx = DemosTransactions.empty()
        const address = demos.getAddress()

        tx.content = {
            ...tx.content,
            type: "identity",
            from: address,
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
        context: "xm" | "web2",
        payload: any,
    ): Promise<RPCResponseWithValidityData> {
        const tx = DemosTransactions.empty()
        const address = demos.getAddress()

        tx.content = {
            ...tx.content,
            type: "identity",
            from: address,
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
        const request = {
            method: "gcr_routine",
            params: [
                {
                    method: call,
                    params: [address || demos.getAddress()],
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
