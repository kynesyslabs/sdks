// TODO Implement the identities abstraction
// This should be able to query and set the GCR identities for a Demos address

import {
    CoreTargetIdentityPayload,
    InferFromSignaturePayload,
    InferFromWritePayload,
} from "@/types/abstraction"
import { Demos } from "@/websdk/demosclass"

export default class Identities {
    // Infer identity from either a write transaction or a signature
    /**
     * Infer an identity from either a write transaction or a signature.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param payload The payload to infer the identity from.
     * @returns The identity inferred from the payload.
     */
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

    /**
     * Remove a crosschain identity associated with an address.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param payload The payload to remove the identity from.
     * @returns The response from the RPC call.
     */
    async removeXmIdentity(demos: Demos, payload: CoreTargetIdentityPayload) {
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

    /**
     * Get the identities associated with an address.
     * If no address is provided, the address of the connected wallet will be used.
     *
     * @param demos A Demos instance to communicate with the RPC.
     * @param address The address to get identities for.
     * @returns The identities associated with the address.
     */
    async getIdentities(demos: Demos, address?: string) {
        const request = {
            method: "gcr_routine",
            params: [
                {
                    method: "getIdentities",
                    params: [address || demos.getAddress()],
                },
            ],
        }

        return await demos.rpcCall(request, true)
    }
}
