import { EnumWeb2Actions } from "@/types"
import { web2_request } from "./utils/skeletons"
import { DemosTransactions } from "./DemosTransactions"
import { Demos } from "./demosclass"
import {
    canonicalJSONStringify,
    validatePureJson,
    looksLikeJsonString,
} from "./utils/canonicalJson"
import type {
    IStartProxyParams,
    Transaction,
    IWeb2Payload,
    IWeb2Result,
} from "@/types"

class Web2InvalidUrlError extends Error {
    code: string
    constructor(message: string) {
        super(message)
        this.name = "Web2InvalidUrlError"
        this.code = "INVALID_URL_SCHEME"
    }
}

function isValidHttpUrl(targetUrl: string): boolean {
    try {
        const parsed = new URL(targetUrl)
        return parsed.protocol === "http:" || parsed.protocol === "https:"
    } catch {
        return false
    }
}

export class Web2Proxy {
    private readonly _sessionId: string
    private readonly _demos: Demos

    constructor(sessionId: string, demos: Demos) {
        this._sessionId = sessionId
        this._demos = demos
    }

    /**
     * Get the session ID.
     * @returns {string} The session ID.
     */
    get sessionId(): string {
        return this._sessionId
    }

    /**
     * Start the proxy.
     * @param {IStartProxyParams} params - The parameters for starting the proxy.
     * @returns {Promise<IWeb2Result>} The result of the proxy.
     */
    async startProxy({
        url,
        method,
        options = {
            headers: {},
            payload: undefined,
            authorization: "",
        },
    }: IStartProxyParams): Promise<IWeb2Result> {
        const normalizedUrl = typeof url === "string" ? url.trim() : url
        if (!normalizedUrl) {
            throw new Web2InvalidUrlError(
                "URL is required for startProxy and cannot be empty.",
            )
        }
        if (!isValidHttpUrl(normalizedUrl)) {
            throw new Web2InvalidUrlError(
                `Invalid URL provided to startProxy. Only http(s) URLs are allowed: ${normalizedUrl}`,
            )
        }
        // Create a fresh copy of web2Request for each call
        const freshWeb2Request = { ...web2_request }

        // Shallow-merge headers without mutating caller's object
        const callerHeaders = options?.headers ? { ...options.headers } : {}

        freshWeb2Request.raw = {
            ...freshWeb2Request.raw,
            action: EnumWeb2Actions.START_PROXY,
            method,
            url: normalizedUrl,
            headers: callerHeaders,
        }

        // Validate and canonicalize
        let canonicalPayload: any = undefined
        if (options?.payload !== undefined) {
            if (typeof options.payload === "object") {
                validatePureJson(options.payload)
                canonicalPayload = canonicalJSONStringify(options.payload)
                // Only set JSON content-type if not already set by caller
                if (
                    !Object.keys(callerHeaders).some(
                        h => h.toLowerCase() === "content-type",
                    )
                ) {
                    callerHeaders["Content-Type"] = "application/json"
                }
            } else if (typeof options.payload === "string") {
                // Heuristic warning for accidental double-stringify
                if (looksLikeJsonString(options.payload)) {
                    console.warn(
                        "[Web2Calls] String payload looks like JSON. It will be used as raw bytes; if you intended object canonicalization, pass the object instead.",
                    )
                }
                canonicalPayload = options.payload
            } else {
                // numbers/booleans/null are allowed by fetch/XHR as body. Use JSON.stringify semantics explicitly
                canonicalPayload = JSON.stringify(options.payload)
                if (
                    !Object.keys(callerHeaders).some(
                        h => h.toLowerCase() === "content-type",
                    )
                ) {
                    callerHeaders["Content-Type"] = "application/json"
                }
            }
        }

        const response = await this._demos.call("web2ProxyRequest", {
            web2Request: freshWeb2Request,
            sessionId: this._sessionId,
            payload: canonicalPayload, // can be undefined ⇒ no body
            authorization: options?.authorization,
        })

        const web2Payload: IWeb2Payload = {
            message: {
                sessionId: this._sessionId,
                payload: "",
                authorization: "",
                web2Request: {
                    ...freshWeb2Request,
                    result: {
                        sessionId: this._sessionId,
                        targetUrl: freshWeb2Request.raw.url,
                        timestamp: Date.now(),
                        status: response.response.status,
                        headers: response.response.headers,
                        responseHash: response.response.responseHash,
                        responseHeadersHash:
                            response.response.responseHeadersHash,
                        ...(response.response.requestHash
                            ? { requestHash: response.response.requestHash }
                            : {}),
                        statusText: response.response.statusText,
                    },
                },
            },
        }

        // Create a transaction to store the web2 payload in the blockchain.
        const web2Tx: Transaction = DemosTransactions.empty()
        web2Tx.content.to = await this._demos.getEd25519Address()
        web2Tx.content.type = "web2Request"
        web2Tx.content.data = ["web2Request", web2Payload]
        web2Tx.content.timestamp = Date.now()

        const signedWeb2Tx = await this._demos.sign(web2Tx)
        const validityData = await this._demos.confirm(signedWeb2Tx)
        const txHash = validityData.response.data.transaction.hash
        await this._demos.broadcast(validityData)

        const result: IWeb2Result = {
            ...response.response,
            txHash,
        }
        return result
    }
}

/**
 * The Web2Calls object provides functions for creating and managing Web2 proxies.
 */
export const web2Calls = {
    /**
     * Create a new DAHR instance.
     * @param {Demos} demos - The demos instance to use for the request.
     * @returns {Promise<Web2Proxy>} A new Web2Proxy instance.
     */
    createDahr: async (demos: Demos): Promise<Web2Proxy> => {
        const usedKeyPair = demos.keypair

        if (!usedKeyPair) {
            throw new Error("No keypair provided and no wallet connected")
        }

        // Create a fresh copy of web2Request for creation
        const freshWeb2Request = { ...web2_request }
        freshWeb2Request.raw = {
            ...freshWeb2Request.raw,
            action: EnumWeb2Actions.CREATE,
        }

        const response = await demos.call("web2ProxyRequest", {
            web2Request: freshWeb2Request,
        })

        const sessionId = response.response?.dahr?.sessionId
        if (!sessionId) {
            throw new Error("Failed to create proxy session")
        }

        return new Web2Proxy(sessionId, demos)
    },
}
