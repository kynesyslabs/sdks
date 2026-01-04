// ! Add the native operation types here (start with send)

interface INativeSend {
    nativeOperation: "send"
    args: [string, number] // [to, amount]
}

// REVIEW: TLSNotary attestation request
interface INativeTlsnRequest {
    nativeOperation: "tlsn_request"
    args: [string] // [targetUrl]
}

export type INativePayload = INativeSend | INativeTlsnRequest
