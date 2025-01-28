import forge from "node-forge"
import { IncomingHttpHeaders, OutgoingHttpHeaders } from "http"

export interface IParam {
    name: string
    value: any
}

export interface IWeb2Result {
    status: number
    statusText: string
    headers: IncomingHttpHeaders
    data: any
}

export interface IWeb2Request {
    raw: IRawWeb2Request
    result: any
    attestations: {}
    hash: string
    signature?: forge.pki.ed25519.BinaryBuffer
}


export interface IWeb2Payload {
    message: {
        sessionId: string
        payload: any
        authorization: any
        web2Request: IWeb2Request
    }
}


export enum EnumWeb2Methods {
    GET = "GET",
    POST = "POST",
    PUT = "PUT",
    DELETE = "DELETE",
    PATCH = "PATCH",
}

export enum EnumWeb2Actions {
    CREATE = "create",
    START_PROXY = "startProxy",
    STOP_PROXY = "stopProxy",
}

export interface IRawWeb2Request {
    action: EnumWeb2Actions
    parameters: IParam[]
    requestedParameters: [] | null
    method: EnumWeb2Methods
    url: string
    headers?: OutgoingHttpHeaders
    minAttestations: number
    stage: {
        origin: {
            identity: forge.pki.ed25519.BinaryBuffer
            connection_url: string
        }
        hop_number: number
    }
}

export interface IWeb2Attestation {
    hash: string
    timestamp: number
    identity: forge.pki.PublicKey
    signature: forge.pki.ed25519.BinaryBuffer
    valid: boolean
}

export interface IAttestationWithResponse extends IWeb2Attestation {
    web2Response: IWeb2Result
}

export interface ISendHTTPRequestParams {
    web2Request: IWeb2Request
    targetMethod: EnumWeb2Methods
    targetHeaders: IWeb2Request["raw"]["headers"]
    payload: unknown
    targetAuthorization: string
}

export interface IAuthorizationException {
    urlPattern: RegExp
    methods: EnumWeb2Methods[]
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
    method: EnumWeb2Methods
    options?: IWeb2RequestOptions
}

export interface IDAHRStartProxyParams {
    method: IWeb2Request["raw"]["method"]
    headers: IWeb2Request["raw"]["headers"]
    payload?: unknown
    authorization?: string
}

export interface IHandleWeb2ProxyRequestParams {
    request: IWeb2Request
    sessionId: string
    payload: unknown
    authorization: string
}
