import forge from "node-forge"

import { getNewUID } from "./utils"
import { Hashing } from "@/encryption"
import { HexToForge } from "@/utils/dataManipulation"

import { IWeb2Request, XMScript } from "@/types"
import { DataTypes } from "@/types/demoswork/types"
import { WorkStepInput } from "@/types/demoswork/steps"

export class WorkStep {
    type: string
    workUID: string
    content: WorkStepInput
    output: any
    description: string
    signature: forge.pki.ed25519.BinaryBuffer

    constructor(payload: WorkStepInput) {
        this.content = payload
        this.workUID = getNewUID()
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
    override type: string = "web2"
    override output = {
        statusCode: {
            type: DataTypes.internal,
            src: {
                stepUID: this.workUID,
                key: "output.statusCode",
            },
        },
        payload: {
            type: DataTypes.internal,
            src: {
                stepUID: this.workUID,
                key: "output.payload",
            },
        },
    }

    constructor(payload: IWeb2Request) {
        super(payload)
    }
}

export class XmWorkStep extends WorkStep {
    override type: string = "xm"
    override output = {
        result: {
            type: DataTypes.internal,
            src: {
                stepUID: this.workUID,
                key: "output.result",
            },
        },
        hash: {
            type: DataTypes.internal,
            src: {
                stepUID: this.workUID,
                key: "output.hash",
            },
        },
    }

    constructor(payload: XMScript) {
        super(payload)
    }
}

export function prepareXMStep(xm_payload: XMScript) {
    return new XmWorkStep(xm_payload)
}



