import { EnumWeb2Actions } from "@/types"
import type { IAttestationWithResponse, IStartProxyParams } from "@/types"
import { demos } from "./demos"
import { web2_request } from "./utils/skeletons"

const web2Request = { ...web2_request }

export class Web2Proxy {
    private readonly _sessionId: string

    constructor(sessionId: string) {
        this._sessionId = sessionId
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
        headers,
        options = {},
    }: IStartProxyParams): Promise<IAttestationWithResponse> {
        const { payload = {}, authorization = "" } = options

        web2Request.raw = {
            ...web2Request.raw,
            action: EnumWeb2Actions.START_PROXY,
            method,
            url,
            headers,
        }

        return await demos.call("web2ProxyRequest", {
            web2Request,
            sessionId: this._sessionId,
            payload,
            authorization,
        })
    }

    /**
     * Stop the proxy.
     * @returns {Promise<void>}
     */
    async stopProxy(): Promise<void> {
        await demos.call("web2ProxyRequest", {
            sessionId: this.sessionId,
            action: EnumWeb2Actions.STOP_PROXY,
        })
    }
}

/**
 * The Web2Calls object provides functions for creating and managing Web2 proxies.
 */
export const web2Calls = {
    /**
     * Create a new DAHR instance.
     * @returns {Promise<Web2Proxy>} A new Web2Proxy instance.
     */
    createDahr: async (): Promise<Web2Proxy> => {
        const response = await demos.call("web2ProxyRequest", {
            web2Request: {
                ...web2Request,
                raw: {
                    ...web2Request.raw,
                    action: EnumWeb2Actions.CREATE,
                },
            },
        })

        if (!response.response?.dahr?.sessionId) {
            throw new Error("Failed to create proxy session")
        }
        return new Web2Proxy(response.response.dahr.sessionId)
    },
}
