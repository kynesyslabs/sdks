import { EnumWeb2Actions } from "@/types"
import { web2_request } from "./utils/skeletons"
import { DemosTransactions } from "./DemosTransactions"
import { Demos } from "./demosclass"
import type {
    IStartProxyParams,
    Transaction,
    IWeb2Payload,
    IWeb2Result,
} from "@/types"

const web2Request = { ...web2_request }

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
            payload: {},
            authorization: "",
        },
    }: IStartProxyParams): Promise<IWeb2Result> {
        web2Request.raw = {
            ...web2Request.raw,
            action: EnumWeb2Actions.START_PROXY,
            method,
            url,
            headers: options?.headers,
        }

        return await this._demos.call("web2ProxyRequest", {
            web2Request,
            sessionId: this._sessionId,
            payload: options?.payload,
            authorization: options?.authorization,
        })
    }

    /**
     * Stop the proxy.
     * @returns {Promise<void>}
     */
    async stopProxy(): Promise<void> {
        await this._demos.call("web2ProxyRequest", {
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
     * @param {Demos} demos - The demos instance to use for the request.
     * @returns {Promise<Web2Proxy>} A new Web2Proxy instance.
     */
    createDahr: async (demos: Demos): Promise<Web2Proxy> => {
        const usedKeyPair = demos.keypair

        if (!usedKeyPair) {
            throw new Error("No keypair provided and no wallet connected")
        }

        const response = await demos.call("web2ProxyRequest", {
            web2Request: {
                ...web2Request,
                raw: {
                    ...web2Request.raw,
                    action: EnumWeb2Actions.CREATE,
                },
            },
        })

        const sessionId = response.response?.dahr?.sessionId
        if (!sessionId) {
            throw new Error("Failed to create proxy session")
        }

        // Creating a web2 payload
        const web2Payload: IWeb2Payload = {
            message: {
                sessionId: sessionId,
                payload: "",
                authorization: "",
                web2Request: web2Request,
            },
        }

        const web2Tx: Transaction = DemosTransactions.empty()
        // From and To are the same in Web2 transactions
        // From will be set during tx signing
        web2Tx.content.to = await demos.getEd25519Address()
        web2Tx.content.type = "web2Request"
        web2Tx.content.data = ["web2Request", web2Payload]
        web2Tx.content.timestamp = Date.now()

        // Signing and broadcasting the transaction
        const signedWeb2Tx = await demos.sign(web2Tx)
        const validityData = await demos.confirm(signedWeb2Tx)
        await demos.broadcast(validityData)

        return new Web2Proxy(sessionId, demos)
    },
}
