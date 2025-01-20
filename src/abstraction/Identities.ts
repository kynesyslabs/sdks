// TODO Implement the identities abstraction
// This should be able to query and set the GCR identities for a Demos address

import {
    InferFromWritePayload,
    InferFromSignaturePayload,
    CoreTargetIdentityPayload,
} from "@/types/abstraction"
import { Demos } from "@/websdk/demosclass"

export default class Identities {
    // Infer identity from either a write transaction or a signature
    async inferIdentity(
        demos: Demos,
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

        return await demos.rpcCall(basePayload, true)
    }

    async removeIdentity(demos: Demos, payload: CoreTargetIdentityPayload) {
        const request = {
            method: "gcr_routine",
            params: [
                {
                    method: "remove_identity",
                    params: [payload],
                },
            ],
        }

        return await demos.rpcCall(request, true)
    }
}
