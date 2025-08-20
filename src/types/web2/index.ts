import forge from "node-forge"
import { IncomingHttpHeaders, OutgoingHttpHeaders } from "http"
import { SigningAlgorithm } from "../cryptography"

export interface IParam {
    name: string
    value: any
}

export interface IWeb2Result {
    status: number
    statusText: string
    headers: IncomingHttpHeaders
    data: any
    dataHash: string
    headersHash: string
    txHash?: string
}

export interface IWeb2Request {
    raw: IRawWeb2Request
    result: any
    hash: string
    signature?: {
        type: SigningAlgorithm
        data: string
    }
}

export interface IWeb2Payload {
    message: {
        sessionId: string
        payload: unknown
        authorization: any
        web2Request: IWeb2Request
    }
}

export type Web2Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH"

export enum EnumWeb2Actions {
    CREATE = "create",
    START_PROXY = "startProxy",
}

export interface IRawWeb2Request {
    action: EnumWeb2Actions
    parameters: IParam[]
    method: Web2Method
    url: string
    headers?: OutgoingHttpHeaders
    stage: {
        origin: {
            identity: forge.pki.ed25519.BinaryBuffer
            connection_url: string
        }
    }
}

export interface ISendHTTPRequestParams {
    web2Request: IWeb2Request
    targetMethod: Web2Method
    targetHeaders: OutgoingHttpHeaders
    payload: unknown
    targetAuthorization: string
}

export interface IAuthorizationException {
    urlPattern: RegExp
    methods: Web2Method[]
}

export interface IAuthorizationConfig {
    requireAuthForAll: boolean
    exceptions: IAuthorizationException[]
    authTimeout?: number
}

export interface IWeb2RequestOptions {
    headers?: OutgoingHttpHeaders
    payload?: unknown
    authorization?: string
}

export interface IStartProxyParams {
    url: string
    method: Web2Method
    options?: IWeb2RequestOptions
}

export interface IDAHRStartProxyParams {
    url: string
    method: Web2Method
    headers: OutgoingHttpHeaders
    payload?: IWeb2RequestOptions["payload"]
    authorization?: IWeb2RequestOptions["authorization"]
}
