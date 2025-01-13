import type { IWeb2Request, Transaction } from "@/types"
import { EnumWeb2Methods, EnumWeb2Actions } from "@/types"
// TODO This should be a collection of classes now that we use TypeScript
// FIXME ^

// INFO An empty transaction
const transaction: Transaction = {
    content: {
        // @ts-expect-error
        type: "", // string
        from: "", // forge.pki.ed25519.BinaryBuffer
        to: "", // forge.pki.ed25519.BinaryBuffer
        amount: 0, // number
        // @ts-expect-error
        data: ["", ""], // [string, string] // type as string and content in hex string
        nonce: 0, // number // Increments every time a transaction is sent from the same account
        timestamp: 0, // number // Is the registered unix timestamp when the transaction was sent the first time
        transaction_fee: {
            network_fee: 0,
            rpc_fee: 0,
            additional_fee: 0,
        },
    },
    signature: null, // pki.ed25519.BinaryBuffer
    hash: "", // string
    status: "", // string
    blockNumber: null, // number
}

// INFO An empty crosschain operation object
const crosschain_operation = {
    chain: null,
    subchain: null,
    is_evm: null,
    rpc: null,
    task: {
        type: null,
        params: {},
        signedPayloads: [],
    },
    // signedPayloads: []
}

// INFO An empty web2 request object
const web2_request: IWeb2Request = {
    raw: {
        action: EnumWeb2Actions.CREATE,
        parameters: [],
        requestedParameters: null, // Means all
        method: EnumWeb2Methods.GET,
        url: "",
        headers: null,
        minAttestations: 2,
        // Handling the various stages of an IWeb2Request
        stage: {
            // The one that will handle the response too
            origin: {
                identity: "",
                connection_url: "",
            },
            // Starting from 0, each attestation it is increased
            hop_number: 0,
        },
    },
    result: null,
    attestations: {},
    hash: "",
    signature: "",
}

export { crosschain_operation, transaction, web2_request }
