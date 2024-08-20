export interface RPCRequest {
    method: string
    params: any[]
}

export interface RPCResponse {
    result: number // HTTP status code
    response: any
    require_reply: boolean
    extra: any
}

export interface BrowserRequest {
    message: string
    data: any
}

export interface ConsensusRequest {
    message: string
    sender: string
}

export type VoteRequest = {
    parameter: string
    timestamp: number
}

export interface NodeCall {
    message: string
    data: any
    muid: string
}

export interface HelloPeerRequest {
    url: string
    port: number
    publicKey: string
}
