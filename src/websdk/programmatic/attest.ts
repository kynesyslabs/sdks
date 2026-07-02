import { Identities } from "@/abstraction"
import type {
    DiscordProof,
    GithubProof,
    TelegramSignedAttestation,
    TwitterProof,
} from "@/types/abstraction"
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
                () => identities.removeWeb2Identity(ctx.demos, payload),
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
