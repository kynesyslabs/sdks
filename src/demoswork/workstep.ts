import forge from "node-forge"

import { Hashing } from "@/encryption/Hashing"
import { HexToForge } from "@/utils/dataManipulation"
import { getNewUID } from "./utils"

import { skeletons } from "@/websdk"
import { IWeb2Request, XMScript } from "@/types"
import { INativePayload } from "@/types/native"
import { DataTypes } from "@/types/demoswork/datatypes"
import { StepOutputKey, WorkStepInput } from "@/types/demoswork/steps"

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
    timestamp: number = Date.now()

    critical: boolean = false
    depends_on: string[] = []

    constructor(payload: WorkStepInput) {
        this.content = payload
        this.id = "step_" + getNewUID()
    }

    // signature: forge.pki.ed25519.BinaryBuffer
    // get hash() {
    //     // REVIEW: What fields should be hashed?
    //     return Hashing.sha256(JSON.stringify(this))
    // }

    /**
     * Sign a work step using a private key
     *
     * @param privateKey The private key
     * @returns The signature
     */
    // sign(privateKey: forge.pki.ed25519.BinaryBuffer | any) {
    //     if (privateKey.type == "string") {
    //         privateKey = HexToForge(privateKey)
    //     }

    //     this.signature = forge.pki.ed25519.sign({
    //         message: this.hash,
    //         encoding: "utf8",
    //         privateKey,
    //     })

    //     return this.signature
    // }

    execute() {
        // INFO: Send payload or execute web2 request here
    }
}

export class Web2WorkStep extends WorkStep {
    override context = "web2"
    override output = {
        statusCode: {
            type: DataTypes.work as DataTypes.work,
            src: {
                self: this as Web2WorkStep,
                key: "output.statusCode",
            },
        },
        payload: {
            type: DataTypes.work as DataTypes.work,
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
            type: DataTypes.work as DataTypes.work,
            src: {
                self: this as XmWorkStep,
                key: "output.result",
            },
        },
        hash: {
            type: DataTypes.work as DataTypes.work,
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
            type: DataTypes.work as DataTypes.work,
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

export function prepareWeb2Step({
    method = "GET",
    url = "https://icanhazip.com",
    parameters = [],
    requestedParameters = null,
    headers = null,
    minAttestations = 2,
}) {
    // Generating an empty request and filling it
    const web2_payload: IWeb2Request = structuredClone(skeletons.web2_request)
    web2_payload.raw.action = method
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
