// ! Add the native operation types here (start with send)

interface INativeSend {
    nativeOperation: "send"
    args: [string, number] // [to, amount]
}

export type INativePayload = INativeSend
