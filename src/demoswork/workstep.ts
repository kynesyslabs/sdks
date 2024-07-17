import forge from "node-forge"

import { Hashing } from "@/encryption"
import { HexToForge } from "@/utils/dataManipulation"
import { getNewUID } from "./utils"

import { IWeb2Request, XMScript } from "@/types"
import { DataTypes } from "@/types/demoswork/datatypes"
import { StepOutputKey, WorkStepInput } from "@/types/demoswork/steps"
import { INativePayload } from "@/types/native"
import { skeletons } from "@/websdk"

export class WorkStep {
    id: string
    context: string
    content: WorkStepInput

    // INFO: The ouput property will be used by devs
    // to refer to the output of the step
    output: {
        [key: string]: StepOutputKey
    }
    description: string
    signature: forge.pki.ed25519.BinaryBuffer
    timestamp: number = Date.now()

    constructor(payload: WorkStepInput) {
        this.content = payload
        this.id = "step_" + getNewUID()
    }

    get hash() {
        // REVIEW: What fields should be hashed?
        return Hashing.sha256(JSON.stringify(this))
    }

    /**
     * Sign a work step using a private key
     *
     * @param privateKey The private key
     * @returns The signature
     */
    sign(privateKey: forge.pki.ed25519.BinaryBuffer | any) {
        if (privateKey.type == "string") {
            console.log("[HexToForge] Deriving a buffer from privateKey...")
            privateKey = HexToForge(privateKey)
        }

        this.signature = forge.pki.ed25519.sign({
            message: this.hash,
            encoding: "utf8",
            privateKey,
        })

        return this.signature
    }

    execute() {
        // INFO: Send payload or execute web2 request here
    }
}

export class Web2WorkStep extends WorkStep {
    override context = "web2"
    override output = {
        statusCode: {
            type: DataTypes.internal,
            src: {
                self: this as Web2WorkStep,
                key: "output.statusCode",
            },
        },
        payload: {
            type: DataTypes.internal,
            src: {
                key: "output.payload",
                self: this as Web2WorkStep,
            },
        },
    }

    constructor(payload: IWeb2Request) {
        super(payload)
    }
}

export class XmWorkStep extends WorkStep {
    override context = "xm"
    override output = {
        // REVIEW: What result fields do developers need?
        result: {
            type: DataTypes.internal,
            src: {
                self: this as XmWorkStep,
                key: "output.result",
            },
        },
        hash: {
            type: DataTypes.internal,
            src: {
                self: this as XmWorkStep,
                key: "output.hash",
            },
        },
    }

    constructor(payload: XMScript) {
        super(payload)
    }
}

export class NativeWorkStep extends WorkStep {
    override context = "native"
    override output = {
        result: {
            type: DataTypes.internal,
            src: {
                self: this as NativeWorkStep,
                key: "output.result",
            },
        },
    }

    constructor(payload: INativePayload) {
        super(payload)
    }
}

// SECTION: Prepare functions
export function prepareXMStep(xm_payload: XMScript) {
    return new XmWorkStep(xm_payload)
}

export function prepareWeb2Step(
    action = "GET",
    url = "https://icanhazip.com",
    parameters = [],
    requestedParameters = null,
    headers = null,
    minAttestations = 2,
) {
    // Generating an empty request and filling it
    const web2_payload: IWeb2Request = skeletons.web2_request
    web2_payload.raw.action = action
    web2_payload.raw.url = url
    web2_payload.raw.parameters = parameters
    web2_payload.raw.headers = headers
    web2_payload.raw.minAttestations = minAttestations
    // Ensuring content is a known property
    web2_payload.attestations = new Map()
    web2_payload.hash = ""
    web2_payload.signature = ""
    web2_payload.result = ""
    return new Web2WorkStep(web2_payload)
}

export function prepareNativeStep(native_payload: INativePayload) {
    return new NativeWorkStep(native_payload)
}
