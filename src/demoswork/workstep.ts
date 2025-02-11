import forge from "node-forge"

import { Hashing } from "@/encryption/Hashing"
import { HexToForge } from "@/utils/dataManipulation"
import { getNewUID } from "./utils"

import { skeletons } from "@/websdk"
import { EnumWeb2Methods, IWeb2Request, XMScript } from "@/types"
import { INativePayload } from "@/types/native"
import { DataTypes } from "@/types/demoswork/datatypes"
import { StepOutputKey, WorkStepInput } from "@/types/demoswork/steps"
import { EnumWeb2Actions } from "@/types"

export class WorkStep {
    id: string
    context: string
    content: WorkStepInput
    description: string
    timestamp: number = Date.now()
    critical: boolean = false
    depends_on: string[] = []

    constructor(payload: WorkStepInput) {
        this.content = payload
        this.id = "step_" + getNewUID()
    }

    get output(): { [key: string]: StepOutputKey } {
        return new Proxy(
            {
                type: DataTypes.work,
                src: {
                    self: this,
                    key: "output",
                },
            } as any,
            {
                get: (target, prop: string | symbol) => {
                    return {
                        type: DataTypes.work,
                        src: {
                            self: this,
                            key: `output.${String(prop)}`,
                        },
                    }
                },
            },
        )
    }
    get base_output() {
        return this.output as unknown as StepOutputKey
    }
}

export class Web2WorkStep extends WorkStep {
    override context = "web2"

    constructor(payload: IWeb2Request) {
        super(payload)
    }
}

export class XmWorkStep extends WorkStep {
    override context = "xm"

    constructor(payload: XMScript) {
        super(payload)
    }
}

export class NativeWorkStep extends WorkStep {
    override context = "native"

    constructor(payload: INativePayload) {
        super(payload)
    }
}

// SECTION: Prepare functions
export function prepareXMStep(xm_payload: XMScript) {
    return new XmWorkStep(xm_payload)
}

export function prepareWeb2Step({
    method = EnumWeb2Methods.GET,
    url = "https://icanhazip.com",
    parameters = [],
    headers = null,
    minAttestations = 2,
}) {
    // Generating an empty request and filling it
    const web2_payload: IWeb2Request = structuredClone(skeletons.web2_request)
    web2_payload.raw.action = EnumWeb2Actions.CREATE
    web2_payload.raw.method = method
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
