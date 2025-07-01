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
}

export interface IWeb2Request {
    raw: IRawWeb2Request
    result: any
    attestations: {}
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
    signature: {
        type: SigningAlgorithm
        data: string
    }
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
    method: IWeb2Request["raw"]["method"]
    options?: IWeb2RequestOptions
}

export interface IDAHRStartProxyParams {
    method: IWeb2Request["raw"]["method"]
    headers: IWeb2Request["raw"]["headers"]
    payload?: IWeb2RequestOptions["payload"]
    authorization?: IWeb2RequestOptions["authorization"]
}

export interface Tweet {
    id: string
    likes: number
    created_at: string
    text: string
    retweets: number
    bookmarks: number
    quotes: number
    replies: number
    lang: string
    conversation_id: string
    author: {
        rest_id: string
        name: string
        screen_name: string
        image: string
        blue_verified: boolean
    }
    media: {
        video: Array<{
            media_url_https: string
            variants: Array<{
                bitrate?: number
                content_type: string
                url: string
            }>
        }>
    }
}

export interface TweetSimplified {
    id: string
    created_at: string
    text: string
    username: string
    userId: string
}