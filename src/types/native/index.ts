// ! Add the native operation types here (start with send)

export interface INativePayload {
    nativeOperation: string
    args: any[]
    kwargs: { [key: string]: any }
    resolved: boolean
    result: boolean
}