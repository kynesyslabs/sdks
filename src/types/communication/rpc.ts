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