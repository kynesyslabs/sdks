// Import the class directly (not via the @/abstraction barrel) to avoid
// pulling the coin-finder/provider surface into the websdk bundle and to
// narrow the websdk↔abstraction module cycle.
import { Identities } from "@/abstraction/Identities"
import type { UnifiedDomainResolution } from "@/abstraction/types/UDResolution"
import type {
    DiscordProof,
    EthosIdentityRemoveData,
    EthosWalletIdentity,
    GithubProof,
    HumanPassportIdentityData,
    InferFromSignaturePayload,
    NomisWalletIdentity,
    TelegramSignedAttestation,
    TLSNIdentityContext,
    TLSNotaryPresentation,
    TLSNProofRanges,
    TwitterProof,
    XMCoreTargetIdentityPayload,
} from "@/types/abstraction"
import type { PQCAlgorithm } from "@/types/cryptography"
import type { IStartProxyParams, IWeb2Result } from "@/types/web2"
import type { ProgrammaticContext } from "./context"
import type { ProgrammaticTxOptions, ProgrammaticTxResult } from "./types"

/**
 * Identity-attestation transactions as one-call programmatic transactions.
 *
 * Groups the web2 identity proofs (GitHub, Twitter/X, Discord, Telegram,
 * domain) and their removal into a single namespace. Each builder collapses
 * the classic `infer → confirm → broadcast` flow into one call that
 * auto-broadcasts within the configured fee ceiling: the `Identities.*`
 * builders sign + confirm internally and return an already-confirmed
 * `RPCResponseWithValidityData`, which the shared runner (via `ctx.run`)
 * detects and forwards straight to broadcast without re-confirming.
 *
 * Also exposes {@link dahr}, the DAHR web2-proxy attestation. Unlike the
 * identity builders, DAHR does its own sign + confirm + broadcast lifecycle
 * server-side, so it bypasses `ctx.run` entirely and does not honour
 * {@link ProgrammaticTxOptions}.
 */
export function createAttestNamespace(ctx: ProgrammaticContext) {
    const identities = new Identities()

    return {
        /**
         * Link a GitHub identity to the connected wallet, end to end.
         *
         * @example
         * ```ts
         * await demos.run.attest.github(
         *     "https://gist.github.com/user/abc123",
         * )
         * ```
         *
         * @param proof - The GitHub gist/raw proof URL.
         * @param referralCode - Optional referral code for incentive points.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        github: (
            proof: GithubProof,
            referralCode?: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.addGithubIdentity(
                        ctx.demos,
                        proof,
                        referralCode,
                        { nonce: opts?.nonce },
                    ),
                opts,
            ),

        /**
         * Link a Twitter/X identity to the connected wallet, end to end.
         *
         * @example
         * ```ts
         * await demos.run.attest.twitter("https://x.com/user/status/123")
         * ```
         *
         * @param proof - The tweet proof URL.
         * @param referralCode - Optional referral code for incentive points.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        twitter: (
            proof: TwitterProof,
            referralCode?: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.addTwitterIdentity(
                        ctx.demos,
                        proof,
                        referralCode,
                        { nonce: opts?.nonce },
                    ),
                opts,
            ),

        /**
         * Link a Discord identity to the connected wallet, end to end.
         *
         * @example
         * ```ts
         * await demos.run.attest.discord(
         *     "https://discord.com/channels/guild/chan/msg",
         * )
         * ```
         *
         * @param proof - The Discord message proof URL.
         * @param referralCode - Optional referral code for incentive points.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        discord: (
            proof: DiscordProof,
            referralCode?: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.addDiscordIdentity(
                        ctx.demos,
                        proof,
                        referralCode,
                        { nonce: opts?.nonce },
                    ),
                opts,
            ),

        /**
         * Link a Telegram identity to the connected wallet, end to end.
         *
         * @example
         * ```ts
         * await demos.run.attest.telegram(signedAttestation)
         * ```
         *
         * @param attestation - The signed Telegram bot attestation.
         * @param referralCode - Optional referral code for incentive points.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        telegram: (
            attestation: TelegramSignedAttestation,
            referralCode?: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.addTelegramIdentity(
                        ctx.demos,
                        attestation,
                        referralCode,
                        { nonce: opts?.nonce },
                    ),
                opts,
            ),

        /**
         * Link a domain identity (CCI) to the connected wallet, end to end.
         *
         * Requires the proof payload from
         * `Identities.createDomainProofPayload` to already be hosted at
         * `https://<host>/.well-known/demos-cci.txt`.
         *
         * @example
         * ```ts
         * await demos.run.attest.domain("example.com")
         * ```
         *
         * @param hostname - The domain being claimed (e.g. "example.com"). A
         *                    full URL is also accepted; only the host is used.
         * @param referralCode - Optional referral code for incentive points.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        domain: (
            hostname: string,
            referralCode?: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.addDomainIdentity(
                        ctx.demos,
                        hostname,
                        referralCode,
                        { nonce: opts?.nonce },
                    ),
                opts,
            ),

        /**
         * Remove a web2 identity from the connected wallet, end to end.
         *
         * @example
         * ```ts
         * await demos.run.attest.removeWeb2({
         *     context: "github",
         *     username: "octocat",
         * })
         * ```
         *
         * @param payload - The identity to unlink (`context` + `username`).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        removeWeb2: (
            payload: { context: string; username: string },
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.removeWeb2Identity(ctx.demos, payload, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

        /**
         * Link a crosschain (XM) identity from a signature, end to end.
         *
         * @example
         * ```ts
         * await demos.run.attest.xm({
         *     chain: "eth",
         *     subchain: "mainnet",
         *     targetAddress: "0x...",
         *     signature: "0x...",
         * })
         * ```
         *
         * @param payload - The signature-inference payload identifying the
         *                   crosschain address to link.
         * @param referralCode - Optional referral code for incentive points.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        xm: (
            payload: InferFromSignaturePayload,
            referralCode?: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.inferXmIdentity(
                        ctx.demos,
                        payload,
                        referralCode,
                        { nonce: opts?.nonce },
                    ),
                opts,
            ),

        /**
         * Remove a crosschain (XM) identity from the connected wallet, end to
         * end.
         *
         * @example
         * ```ts
         * await demos.run.attest.removeXm({
         *     chain: "eth",
         *     subchain: "mainnet",
         *     targetAddress: "0x...",
         * })
         * ```
         *
         * @param payload - The crosschain identity to unlink.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        removeXm: (
            payload: XMCoreTargetIdentityPayload,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.removeXmIdentity(ctx.demos, payload, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

        /**
         * Bind post-quantum (PQC) identities to the connected wallet, end to
         * end.
         *
         * Generates the requested PQC keypairs, signs each address with the
         * wallet's ed25519 key, and links them on the GCR.
         *
         * @example
         * ```ts
         * // Bind every supported PQC algorithm:
         * await demos.run.attest.pqc()
         * // Or a specific subset:
         * await demos.run.attest.pqc(["ml-dsa-65"])
         * ```
         *
         * @param algorithms - The PQC algorithms to bind, or `"all"` (default)
         *                      to bind every supported algorithm.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        pqc: (
            algorithms: "all" | PQCAlgorithm[] = "all",
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.bindPqcIdentity(ctx.demos, algorithms, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

        /**
         * Remove post-quantum (PQC) identities from the connected wallet, end
         * to end.
         *
         * @example
         * ```ts
         * await demos.run.attest.removePqc()
         * ```
         *
         * @param algorithms - The PQC algorithms to remove, or `"all"`
         *                      (default) to remove every supported algorithm.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        removePqc: (
            algorithms: "all" | PQCAlgorithm[] = "all",
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.removePqcIdentity(ctx.demos, algorithms, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

        /**
         * Link an Unstoppable Domain identity to the connected wallet, end to
         * end.
         *
         * The signing address must be the owner or an authorized address in the
         * supplied {@link UnifiedDomainResolution} (resolve it first via
         * `Identities.resolveUDDomain`), and must have signed the challenge.
         *
         * @example
         * ```ts
         * const resolution = await demos.abstraction.identities.resolveUDDomain(
         *     demos,
         *     "brad.crypto",
         * )
         * await demos.run.attest.ud(
         *     signingAddress,
         *     signature,
         *     challenge,
         *     resolution,
         * )
         * ```
         *
         * @param signingAddress - The address used to sign the challenge (owner
         *                          or authorized on the domain).
         * @param signature - The signature over the challenge message.
         * @param challenge - The challenge message that was signed.
         * @param resolutionData - The resolved domain data (owner, network,
         *                          registry type, authorized addresses).
         * @param referralCode - Optional referral code for incentive points.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        ud: (
            signingAddress: string,
            signature: string,
            challenge: string,
            resolutionData: UnifiedDomainResolution,
            referralCode?: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.addUnstoppableDomainIdentity(
                        ctx.demos,
                        signingAddress,
                        signature,
                        challenge,
                        resolutionData,
                        referralCode,
                        { nonce: opts?.nonce },
                    ),
                opts,
            ),

        /**
         * Remove an Unstoppable Domain identity from the connected wallet, end
         * to end.
         *
         * @example
         * ```ts
         * await demos.run.attest.removeUd("brad.crypto")
         * ```
         *
         * @param domain - The UD domain to unlink (e.g. "brad.crypto").
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        removeUd: (
            domain: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.removeUnstoppableDomainIdentity(
                        ctx.demos,
                        domain,
                        { nonce: opts?.nonce },
                    ),
                opts,
            ),

        /**
         * Link a Nomis wallet identity to the connected wallet, end to end.
         *
         * @example
         * ```ts
         * await demos.run.attest.nomis({
         *     walletAddress: "0x...",
         *     chain: "evm",
         *     subchain: "mainnet",
         *     score: 42,
         * })
         * ```
         *
         * @param payload - The Nomis wallet identity data to link.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        nomis: (
            payload: NomisWalletIdentity,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.addNomisIdentity(ctx.demos, payload, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

        /**
         * Remove a Nomis wallet identity from the connected wallet, end to end.
         *
         * @example
         * ```ts
         * await demos.run.attest.removeNomis({
         *     walletAddress: "0x...",
         *     chain: "evm",
         *     subchain: "mainnet",
         * })
         * ```
         *
         * @param payload - The Nomis wallet identity data identifying the
         *                   identity to remove.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        removeNomis: (
            payload: NomisWalletIdentity,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.removeNomisIdentity(ctx.demos, payload, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

        /**
         * Link a Human Passport identity to the connected wallet, end to end.
         *
         * @example
         * ```ts
         * await demos.run.attest.humanpassport({
         *     address: "0x...",
         *     verificationMethod: "api",
         * })
         * ```
         *
         * @param payload - The Human Passport identity data to link.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        humanpassport: (
            payload: HumanPassportIdentityData,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.addHumanPassportIdentity(ctx.demos, payload, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

        /**
         * Remove a Human Passport identity from the connected wallet, end to
         * end.
         *
         * @example
         * ```ts
         * await demos.run.attest.removeHumanpassport("0x...")
         * ```
         *
         * @param address - The EVM address of the Human Passport identity to
         *                   remove.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        removeHumanpassport: (
            address: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.removeHumanPassportIdentity(ctx.demos, address, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

        /**
         * Link an Ethos wallet identity to the connected wallet, end to end.
         *
         * @example
         * ```ts
         * await demos.run.attest.ethos({
         *     chain: "evm",
         *     subchain: "mainnet",
         *     address: "0x...",
         *     score: 1600,
         *     lastSyncedAt: new Date().toISOString(),
         * })
         * ```
         *
         * @param payload - The Ethos wallet identity data to link.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        ethos: (
            payload: EthosWalletIdentity,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.addEthosIdentity(ctx.demos, payload, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

        /**
         * Remove an Ethos wallet identity from the connected wallet, end to
         * end.
         *
         * @example
         * ```ts
         * await demos.run.attest.removeEthos({
         *     chain: "evm",
         *     subchain: "mainnet",
         *     address: "0x...",
         * })
         * ```
         *
         * @param payload - The identifying data (chain, subchain, address) for
         *                   the Ethos identity to remove.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        removeEthos: (
            payload: EthosIdentityRemoveData,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.removeEthosIdentity(ctx.demos, payload, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

        /**
         * Link a web2 identity via a TLSNotary attestation, end to end.
         *
         * The proof and its associated fields come from a TLSNotary
         * presentation over the platform's API (GitHub, Discord, or Telegram).
         *
         * @example
         * ```ts
         * await demos.run.attest.tlsn(
         *     "github",
         *     presentation,
         *     recvHash,
         *     proofRanges,
         *     revealedRecv,
         *     "octocat",
         *     583231,
         * )
         * ```
         *
         * @param context - The platform context ("github", "discord", or
         *                   "telegram").
         * @param proof - The TLSNotary presentation.
         * @param recvHash - The hash of the proven received transcript.
         * @param proofRanges - The revealed byte ranges of the transcript.
         * @param revealedRecv - The revealed received transcript bytes.
         * @param username - The username from the proven response.
         * @param userId - The user id from the proven response.
         * @param referralCode - Optional referral code for incentive points.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        tlsn: (
            context: TLSNIdentityContext,
            proof: TLSNotaryPresentation,
            recvHash: string,
            proofRanges: TLSNProofRanges,
            revealedRecv: number[],
            username: string,
            userId: string | number,
            referralCode?: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.addWeb2IdentityViaTLSN(
                        ctx.demos,
                        context,
                        proof,
                        recvHash,
                        proofRanges,
                        revealedRecv,
                        username,
                        userId,
                        referralCode,
                        { nonce: opts?.nonce },
                    ),
                opts,
            ),

        /**
         * Remove a web2 identity that was added via TLSNotary, end to end.
         *
         * @example
         * ```ts
         * await demos.run.attest.removeTlsn("github", "octocat")
         * ```
         *
         * @param context - The platform context ("github", "discord", or
         *                   "telegram").
         * @param username - The username to remove.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        removeTlsn: (
            context: TLSNIdentityContext,
            username: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    identities.removeWeb2IdentityViaTLSN(
                        ctx.demos,
                        context,
                        username,
                        { nonce: opts?.nonce },
                    ),
                opts,
            ),

        /**
         * Run a DAHR web2-proxy attestation.
         *
         * Unlike the identity builders above, DAHR does not go through
         * `ctx.run`: the web2 proxy performs its own sign + confirm +
         * broadcast lifecycle server-side. As a result
         * {@link ProgrammaticTxOptions} (e.g. `maxFee`, `confirm`) do not
         * apply here — there is no local confirm/broadcast stage to govern.
         *
         * @example
         * ```ts
         * const result = await demos.run.attest.dahr({
         *     url: "https://api.example.com/me",
         *     method: "GET",
         * })
         * ```
         *
         * @param params - The proxy request parameters (url, method, options).
         * @returns The web2 proxy result, including the attested response.
         */
        dahr: async (params: IStartProxyParams): Promise<IWeb2Result> => {
            const proxy = await ctx.demos.web2.createDahr()
            return proxy.startProxy(params)
        },
    }
}
