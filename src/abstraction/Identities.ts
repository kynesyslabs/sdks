// TODO Implement the identities abstraction
// This should be able to query and set the GCR identities for a Demos address

import { RPCRequest, RPCResponse } from "@/types"
import {
    InferFromWritePayload,
    InferFromSignaturePayload,
} from "@/types/abstraction"
import { demos, DemosWebAuth } from "@/websdk"
import { Demos } from "@/websdk/demosclass"
import axios from "axios"

export default class Identities {
    constructor() {}

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

        const res = await demos.rpcCall(basePayload, true)
        console.log(res)

        // TODO Implement the RPC call
        return false
    }
}
