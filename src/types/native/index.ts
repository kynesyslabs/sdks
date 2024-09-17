export interface INativePayload {
    nativeOperation: string
    args: any[]
    kwargs: { [key: string]: any }
    resolved: boolean
    result: boolean
}