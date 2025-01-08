// TODO Implement the identities abstraction
// This should be able to query and set the GCR identities for a Demos address

import {
    InferFromWritePayload,
    InferFromSignaturePayload,
} from "@/types/abstraction"

export default class Identities {
    constructor() {}

    // Infer identity from either a write transaction or a signature
    async inferIdentity(
        payload: InferFromWritePayload | InferFromSignaturePayload,
    ): Promise<string | false> {
        const basePayload = {
            method: "gcr_routine",
            params: [
                {
                    method: payload.method,
                    params: [payload],
                },
            ],
        }
        // TODO Implement the RPC call
        return false
    }
}
