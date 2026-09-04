/**
 * Runtime boundary for tlsn-js.
 *
 * tlsn-js 0.1.0-alpha.12 is a browser-targeted CommonJS/UMD bundle. Eagerly
 * importing it from an ES module makes every Demos SDK entry point that
 * reaches TLSNotary fail in plain Node: the bundle reads `self` during module
 * evaluation, and Node cannot reliably synthesize its named exports.
 *
 * Keep the dependency behind an operation-time import and normalize both the
 * CommonJS and bundler namespace shapes. The small facades below retain the
 * public tlsn-js constructor types while delaying browser-only evaluation
 * until a TLSNotary operation actually needs it.
 */

import { Buffer } from "buffer"

type TlsnModule = typeof import("tlsn-js")

type UnknownModule = Record<string, unknown> & { default?: unknown }

let runtimePromise: Promise<TlsnModule> | undefined

function hasTlsnRuntime(value: unknown): value is TlsnModule {
    if ((typeof value !== "object" && typeof value !== "function") || !value) {
        return false
    }

    const candidate = value as UnknownModule
    return (
        typeof candidate.default === "function" &&
        typeof candidate.Prover === "function" &&
        typeof candidate.Presentation === "function" &&
        typeof candidate.NotaryServer === "function" &&
        typeof candidate.Transcript === "function"
    )
}

function isBrowserRuntime(): boolean {
    return (
        typeof globalThis !== "undefined" &&
        typeof (globalThis as typeof globalThis & { self?: unknown }).self !==
            "undefined" &&
        typeof globalThis.addEventListener === "function"
    )
}

/** Load the browser-only tlsn-js bundle when an operation first needs it. */
export async function loadTlsnRuntime(): Promise<TlsnModule> {
    if (!isBrowserRuntime()) {
        throw new Error(
            "TLSNotary operations require a browser or Web Worker runtime with WASM support.",
        )
    }

    runtimePromise ??= import("tlsn-js")
        .then((namespace: UnknownModule) => {
            if (hasTlsnRuntime(namespace)) return namespace
            if (hasTlsnRuntime(namespace.default)) return namespace.default

            throw new Error(
                "The installed tlsn-js package has an unsupported runtime export shape.",
            )
        })
        .catch((error: unknown) => {
            runtimePromise = undefined
            throw error
        })

    return runtimePromise
}

const init: TlsnModule["default"] = async (config) => {
    const runtime = await loadTlsnRuntime()
    await runtime.default(config)
}

class LazyProver {
    readonly #config: ConstructorParameters<TlsnModule["Prover"]>[0]
    #runtimeInstance:
        | Promise<InstanceType<TlsnModule["Prover"]>>
        | undefined

    constructor(config: ConstructorParameters<TlsnModule["Prover"]>[0]) {
        this.#config = config
    }

    static async notarize(
        options: Parameters<TlsnModule["Prover"]["notarize"]>[0],
    ): ReturnType<TlsnModule["Prover"]["notarize"]> {
        const runtime = await loadTlsnRuntime()
        return runtime.Prover.notarize(options)
    }

    static getHeaderMap(
        url: string,
        body?: unknown,
        headers: Record<string, string> = {},
    ): Map<string, number[]> {
        const defaults: Record<string, string> = {
            Host: new URL(url).hostname,
            Connection: "close",
        }

        if (typeof body === "string") {
            defaults["Content-Length"] = body.length.toString()
        } else if (typeof body === "object") {
            defaults["Content-Length"] = JSON.stringify(body).length.toString()
        } else if (typeof body === "number") {
            defaults["Content-Length"] = body.toString().length.toString()
        }

        return new Map(
            Object.entries({ ...defaults, ...headers }).map(([name, value]) => [
                name,
                Buffer.from(value).toJSON().data,
            ]),
        )
    }

    async #instance(): Promise<InstanceType<TlsnModule["Prover"]>> {
        this.#runtimeInstance ??= loadTlsnRuntime().then(
            ({ Prover: RuntimeProver }) => new RuntimeProver(this.#config),
        )
        return this.#runtimeInstance
    }

    async free(): Promise<void> {
        return (await this.#instance()).free()
    }

    async setup(verifierUrl: string): Promise<void> {
        return (await this.#instance()).setup(verifierUrl)
    }

    async transcript(): ReturnType<
        InstanceType<TlsnModule["Prover"]>["transcript"]
    > {
        return (await this.#instance()).transcript()
    }

    async sendRequest(
        wsProxyUrl: string,
        request: Parameters<
            InstanceType<TlsnModule["Prover"]>["sendRequest"]
        >[1],
    ): ReturnType<InstanceType<TlsnModule["Prover"]>["sendRequest"]> {
        return (await this.#instance()).sendRequest(wsProxyUrl, request)
    }

    async notarize(
        commit?: Parameters<
            InstanceType<TlsnModule["Prover"]>["notarize"]
        >[0],
    ): ReturnType<InstanceType<TlsnModule["Prover"]>["notarize"]> {
        return (await this.#instance()).notarize(commit)
    }

    async reveal(
        reveal: Parameters<InstanceType<TlsnModule["Prover"]>["reveal"]>[0],
    ): Promise<void> {
        return (await this.#instance()).reveal(reveal)
    }
}

class LazyPresentation {
    readonly #params: ConstructorParameters<TlsnModule["Presentation"]>[0]
    #runtimeInstance:
        | Promise<InstanceType<TlsnModule["Presentation"]>>
        | undefined

    constructor(params: ConstructorParameters<TlsnModule["Presentation"]>[0]) {
        this.#params = params
    }

    async #instance(): Promise<InstanceType<TlsnModule["Presentation"]>> {
        this.#runtimeInstance ??= loadTlsnRuntime().then(
            ({ Presentation: RuntimePresentation }) =>
                new RuntimePresentation(this.#params),
        )
        return this.#runtimeInstance
    }

    async free(): Promise<void> {
        return (await this.#instance()).free()
    }

    async serialize(): Promise<string> {
        return (await this.#instance()).serialize()
    }

    async verifyingKey(): ReturnType<
        InstanceType<TlsnModule["Presentation"]>["verifyingKey"]
    > {
        return (await this.#instance()).verifyingKey()
    }

    async json(): ReturnType<
        InstanceType<TlsnModule["Presentation"]>["json"]
    > {
        return (await this.#instance()).json()
    }

    async verify(): ReturnType<
        InstanceType<TlsnModule["Presentation"]>["verify"]
    > {
        return (await this.#instance()).verify()
    }
}

class CompatibleNotaryServer {
    readonly #url: string

    static from(url: string): CompatibleNotaryServer {
        return new CompatibleNotaryServer(url)
    }

    constructor(url: string) {
        this.#url = url
    }

    get url(): string {
        return this.#url
    }

    async publicKey(encoding: "pem" | "hex" = "hex"): Promise<string> {
        const response = await fetch(`${this.#url}/info`)
        const { publicKey } = (await response.json()) as { publicKey?: unknown }
        if (typeof publicKey !== "string" || publicKey.length === 0) {
            throw new Error("invalid public key")
        }
        if (encoding === "pem") return publicKey

        return Buffer.from(
            publicKey
                .replace("-----BEGIN PUBLIC KEY-----", "")
                .replace("-----END PUBLIC KEY-----", "")
                .replace(/\n/gu, ""),
            "base64",
        )
            .subarray(23)
            .toString("hex")
    }

    normalizeUrl(): string {
        const parsed = new URL(this.#url)
        const protocol =
            parsed.protocol === "https:" || parsed.protocol === "http:"
                ? parsed.protocol
                : parsed.protocol === "wss:"
                  ? "https:"
                  : "http:"
        return `${protocol}//${parsed.host}`
    }

    async sessionUrl(maxSentData?: number, maxRecvData?: number): Promise<string> {
        const response = await fetch(`${this.#url}/session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                clientType: "Websocket",
                maxRecvData,
                maxSentData,
            }),
        })
        const { sessionId } = (await response.json()) as { sessionId?: unknown }
        if (typeof sessionId !== "string" || sessionId.length === 0) {
            throw new Error("invalid session id")
        }

        const parsed = new URL(this.#url)
        const protocol = parsed.protocol === "https:" ? "wss" : "ws"
        const pathname = parsed.pathname
        return `${protocol}://${parsed.host}${pathname === "/" ? "" : pathname}/notarize?sessionId=${sessionId}`
    }
}

class CompatibleTranscript {
    readonly #sent: number[]
    readonly #recv: number[]

    constructor(params: { sent: number[]; recv: number[] }) {
        this.#sent = params.sent
        this.#recv = params.recv
    }

    get raw(): { recv: number[]; sent: number[] } {
        return { recv: this.#recv, sent: this.#sent }
    }

    recv(redactedSymbol = "*"): string {
        return this.#recv.reduce(
            (output, value) =>
                output +
                (value === 0
                    ? redactedSymbol
                    : Buffer.from([value]).toString()),
            "",
        )
    }

    sent(redactedSymbol = "*"): string {
        return this.#sent.reduce(
            (output, value) =>
                output +
                (value === 0
                    ? redactedSymbol
                    : Buffer.from([value]).toString()),
            "",
        )
    }

    text = (redactedSymbol = "*"): { sent: string; recv: string } => ({
        sent: this.sent(redactedSymbol),
        recv: this.recv(redactedSymbol),
    })
}

export const Prover = LazyProver as unknown as TlsnModule["Prover"]
export const Presentation =
    LazyPresentation as unknown as TlsnModule["Presentation"]
export const NotaryServer =
    CompatibleNotaryServer as unknown as TlsnModule["NotaryServer"]
export const Transcript =
    CompatibleTranscript as unknown as TlsnModule["Transcript"]

export default init
