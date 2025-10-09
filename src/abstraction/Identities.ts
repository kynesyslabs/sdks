// TODO Implement the identities abstraction
// This should be able to query and set the GCR identities for a Demos address

import axios from "axios"
import { ethers } from "ethers"
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
    DiscordProof,
    InferFromDiscordPayload,
    InferFromTelegramPayload,
    TelegramProof,
    TelegramSignedAttestation,
    TelegramAttestationPayload,
    FindDemosIdByWeb2IdentityQuery,
    FindDemosIdByWeb3IdentityQuery,
    UDIdentityPayload,
    UDIdentityAssignPayload,
} from "@/types/abstraction"
import { Demos } from "@/websdk/demosclass"
import { PQCAlgorithm } from "@/types/cryptography"
import { Account, RPCResponseWithValidityData } from "@/types"
import { uint8ArrayToHex, UnifiedCrypto } from "@/encryption"
import { _required as required, DemosTransactions } from "@/websdk"

export class Identities {
    formats = {
        web2: {
            github: [
                "https://gist.github.com",
                "https://raw.githubusercontent.com",
                "https://gist.githubusercontent.com",
            ],
            twitter: ["https://x.com", "https://twitter.com"],
            discord: [
                "https://discord.com/channels",
                "https://ptb.discord.com/channels",
            ],
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

        return `demos:${message}:${demos.algorithm}:${uint8ArrayToHex(
            signature.signature,
        )}`
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
        context: "xm" | "web2" | "pqc" | "ud",
        payload: any,
    ): Promise<RPCResponseWithValidityData> {
        if (context === "web2") {
            // Skip validation for telegram as it uses custom attestation format, not URL proofs
            if (
                payload.context !== "telegram" &&
                this.formats.web2[payload.context]
            ) {
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
        context: "xm" | "web2" | "pqc" | "ud",
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
    async inferXmIdentity(
        demos: Demos,
        payload: InferFromSignaturePayload,
        referralCode?: string,
    ) {
        return await this.inferIdentity(demos, "xm", {
            ...payload,
            referralCode: referralCode,
        })
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
    async addGithubIdentity(
        demos: Demos,
        payload: GithubProof,
        referralCode?: string,
    ) {
        const username = payload.split("/")[3]
        const ghUser = await axios.get(
            `https://api.github.com/users/${username}`,
        )

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
    async addTwitterIdentity(
        demos: Demos,
        payload: TwitterProof,
        referralCode?: string,
    ) {
        const data = await demos.web2.getTweet(payload)

        if (!data.success) {
            throw new Error(data.error)
        }

        if (!data.tweet.userId || !data.tweet.username) {
            throw new Error(
                "Unable to get twitter user info. Please try again.",
            )
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

    /**
     * Add a discord identity to the GCR.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param payload The payload to add the identity to.
     * @returns The response from the RPC call.
     */
    async addDiscordIdentity(
        demos: Demos,
        payload: DiscordProof,
        referralCode?: string,
    ) {
        const data = await demos.web2.getDiscordMessage(payload)

        if (!data.success) {
            throw new Error(data.error)
        }

        const msg = data.message
        if (!msg.authorId || !msg.authorUsername) {
            throw new Error(
                "Unable to get discord user info. Please try again.",
            )
        }

        const discordPayload: InferFromDiscordPayload & {
            referralCode?: string
        } = {
            context: "discord",
            proof: payload,
            username: msg.authorUsername,
            userId: msg.authorId,
            referralCode: referralCode,
        }

        return await this.inferIdentity(demos, "web2", discordPayload)
    }

    /**
     * Add a telegram identity to the GCR.
     * This method is designed to work with telegram bot attestations.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param payload The telegram identity payload containing user and bot signatures.
     * @param referralCode Optional referral code for incentive points.
     * @returns The response from the RPC call.
     */
    async addTelegramIdentity(
        demos: Demos,
        payload: TelegramSignedAttestation,
        referralCode?: string,
    ) {
        const telegramPayload: InferFromTelegramPayload & {
            referralCode?: string
        } = {
            context: "telegram",
            proof: payload,
            username: payload.payload.username,
            userId: payload.payload.telegram_user_id,
            referralCode: referralCode,
        }

        return await this.inferIdentity(demos, "web2", telegramPayload)
    }

    // SECTION: PQC Identities
    async bindPqcIdentity(
        demos: Demos,
        algorithms: "all" | PQCAlgorithm[] = "all",
    ) {
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
            const signature = await demos.crypto.sign(
                "ed25519",
                new TextEncoder().encode(address),
            )

            payloads.push({
                algorithm: addressType,
                address: address,
                signature: uint8ArrayToHex(signature.signature),
            })
        }

        return await this.inferIdentity(demos, "pqc", payloads)
    }

    async removePqcIdentity(
        demos: Demos,
        algorithms: "all" | PQCAlgorithm[] = "all",
    ) {
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
    async getUserPoints(
        demos: Demos,
        address?: string,
    ): Promise<RPCResponseWithValidityData> {
        required(
            address || demos.walletConnected,
            "No address provided and no wallet connected",
        )

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
            params: [{ method: "getReferralInfo", params: [address] }],
        }

        return await demos.rpcCall(request, true)
    }

    /**
     * Get demos accounts by linked web2 or web3 identity.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param identity The identity to get the account for.
     * @returns The account associated with the identity.
     */
    async getDemosIdsByIdentity(
        demos: Demos,
        identity:
            | FindDemosIdByWeb2IdentityQuery
            | FindDemosIdByWeb3IdentityQuery,
    ): Promise<Account[]> {
        const request = {
            method: "gcr_routine",
            params: [{ method: "getAccountByIdentity", params: [identity] }],
        }

        const response = await demos.rpcCall(request, true)

        // INFO: If the response is 200, return the inner gcr object in response key
        if (response.result == 200) {
            return response.response
        }

        // INFO: If the response is not 200, return full response
        return response as any
    }

    /**
     * Get demos accounts by linked web2 identity.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param context The context of the identity to get the account for.
     * @param username The username to get the account for.
     * @param userId The user id to get the account for.
     * @returns The account associated with the identity.
     */
    async getDemosIdsByWeb2Identity(
        demos: Demos,
        context: "twitter" | "github" | "discord" | "telegram",
        username: string,
        userId?: string,
    ) {
        return await this.getDemosIdsByIdentity(demos, {
            type: "web2",
            context: context,
            username: username,
            userId: userId,
        })
    }

    /**
     * Get demos accounts by linked web3 identity.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param chain The chain as a string containing the chain and subchain separated by a period (eg. "eth.mainnet" | "solana.mainnet", etc.)
     * @param address The address to get the account for.
     * @returns The account associated with the identity.
     */
    async getDemosIdsByWeb3Identity(
        demos: Demos,
        chain: `${string}.${string}`,
        address: string,
    ) {
        return await this.getDemosIdsByIdentity(demos, {
            type: "xm",
            chain: chain,
            address: address,
        })
    }

    /**
     * Get demos accounts by linked twitter identity.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param username The username to get the account for.
     * @returns The account associated with the username.
     */
    async getDemosIdsByTwitter(
        demos: Demos,
        username: string,
        userId?: string,
    ) {
        return await this.getDemosIdsByWeb2Identity(
            demos,
            "twitter",
            username,
            userId,
        )
    }

    /**
     * Get demos accounts by linked github identity.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param username The username to get the account for.
     * @param userId The user id to get the account for.
     * @returns The account associated with the identity.
     */
    async getDemosIdsByGithub(demos: Demos, username: string, userId?: string) {
        return await this.getDemosIdsByWeb2Identity(
            demos,
            "github",
            username,
            userId,
        )
    }

    /**
     * Get demos accounts by linked discord identity.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param username The username to get the account for.
     * @param userId The user id to get the account for.
     * @returns The account associated with the identity.
     */
    async getDemosIdsByDiscord(
        demos: Demos,
        username: string,
        userId?: string,
    ) {
        return await this.getDemosIdsByWeb2Identity(
            demos,
            "discord",
            username,
            userId,
        )
    }

    /**
     * Get demos accounts by linked telegram identity.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param username The username to get the account for.
     * @param userId The user id to get the account for.
     * @returns The account associated with the identity.
     */
    async getDemosIdsByTelegram(
        demos: Demos,
        username: string,
        userId?: string,
    ) {
        return await this.getDemosIdsByWeb2Identity(
            demos,
            "telegram",
            username,
            userId,
        )
    }

    // SECTION: Unstoppable Domains Identities

    /**
     * Resolve an Unstoppable Domain to its owner's Ethereum address.
     *
     * Multi-chain resolution strategy (per UD docs):
     * 1. Try Polygon L2 UNS first (most new domains, cheaper gas)
     * 2. Fallback to Ethereum L1 UNS (legacy domains)
     * 3. Fallback to Ethereum L1 CNS (oldest legacy domains)
     *
     * @param domain The UD domain (e.g., "brad.crypto")
     * @returns Object with owner address, network, and registry type
     */
    private async resolveUDDomain(
        domain: string,
    ): Promise<{
        owner: string
        network: "polygon" | "ethereum"
        registryType: "UNS" | "CNS"
    }> {
        const tokenId = ethers.namehash(domain)

        const registryAbi = [
            "function ownerOf(uint256 tokenId) external view returns (address)",
        ]

        // Polygon L2 UNS Registry (primary - most new domains)
        const polygonUnsRegistry = "0xa9a6A3626993D487d2Dbda3173cf58cA1a9D9e9f"
        // Ethereum L1 UNS Registry (fallback)
        const ethereumUnsRegistry =
            "0x049aba7510f45BA5b64ea9E658E342F904DB358D"
        // Ethereum L1 CNS Registry (legacy fallback)
        const ethereumCnsRegistry =
            "0xD1E5b0FF1287aA9f9A268759062E4Ab08b9Dacbe"

        // Try Polygon UNS first (L2 - cheaper, faster, most new domains)
        try {
            const polygonProvider = new ethers.JsonRpcProvider(
                "https://polygon-rpc.com",
            )
            const contract = new ethers.Contract(
                polygonUnsRegistry,
                registryAbi,
                polygonProvider,
            )
            const owner = await contract.ownerOf(tokenId)
            return { owner, network: "polygon", registryType: "UNS" }
        } catch (polygonError) {
            // Polygon failed, try Ethereum UNS
            try {
                const ethereumProvider = new ethers.JsonRpcProvider(
                    "https://eth.llamarpc.com",
                )
                const contract = new ethers.Contract(
                    ethereumUnsRegistry,
                    registryAbi,
                    ethereumProvider,
                )
                const owner = await contract.ownerOf(tokenId)
                return { owner, network: "ethereum", registryType: "UNS" }
            } catch (ethereumUnsError) {
                // Ethereum UNS failed, try Ethereum CNS (legacy)
                const ethereumProvider = new ethers.JsonRpcProvider(
                    "https://eth.llamarpc.com",
                )
                const contract = new ethers.Contract(
                    ethereumCnsRegistry,
                    registryAbi,
                    ethereumProvider,
                )
                const owner = await contract.ownerOf(tokenId)
                return { owner, network: "ethereum", registryType: "CNS" }
            }
        }
    }

    /**
     * Generate a challenge message for Unstoppable Domain ownership verification.
     *
     * The user must sign this challenge with their domain's resolved Ethereum address
     * using MetaMask or another Ethereum wallet.
     *
     * @param demosPublicKey The user's Demos public key (hex string)
     * @returns Challenge message to be signed
     */
    generateUDChallenge(demosPublicKey: string): string {
        const timestamp = Date.now()
        const nonce = Math.random().toString(36).substring(7)

        return (
            `Link Unstoppable Domain to Demos Network\n` +
            `Demos Key: ${demosPublicKey}\n` +
            `Timestamp: ${timestamp}\n` +
            `Nonce: ${nonce}`
        )
    }

    /**
     * Add an Unstoppable Domain identity to the GCR.
     *
     * Flow:
     * 1. Resolve domain to get owner's Ethereum address
     * 2. User signs challenge with Ethereum wallet (MetaMask)
     * 3. Submit domain + signature for verification
     *
     * @param demos A Demos instance to communicate with the RPC
     * @param domain The UD domain (e.g., "brad.crypto")
     * @param signature Signature from domain's resolved Ethereum address
     * @param signedData The challenge message that was signed
     * @param referralCode Optional referral code
     * @returns The response from the RPC call
     *
     * @example
     * ```typescript
     * const identities = new Identities()
     * const challenge = identities.generateUDChallenge(demos.publicKey)
     * // User signs challenge with MetaMask
     * const signature = await ethereum.request({
     *     method: 'personal_sign',
     *     params: [challenge, ethereumAddress]
     * })
     * await identities.addUnstoppableDomainIdentity(
     *     demos,
     *     "brad.crypto",
     *     signature,
     *     challenge
     * )
     * ```
     */
    async addUnstoppableDomainIdentity(
        demos: Demos,
        domain: string,
        signature: string,
        signedData: string,
        referralCode?: string,
    ): Promise<RPCResponseWithValidityData> {
        // Resolve domain to get Ethereum address and network info
        const { owner, network, registryType } =
            await this.resolveUDDomain(domain)

        // For UD, publicKey is the resolved Ethereum address
        // (Ethereum uses address recovery from signature)
        const publicKey = owner

        const udPayload: UDIdentityPayload = {
            domain,
            resolvedAddress: owner,
            signature,
            publicKey,
            signedData,
            network,
            registryType,
        }

        const payload: UDIdentityAssignPayload & { referralCode?: string } = {
            context: "ud",
            method: "ud_identity_assign",
            payload: udPayload,
            referralCode: referralCode,
        }

        return await this.inferIdentity(demos, "ud" as any, payload)
    }
}
