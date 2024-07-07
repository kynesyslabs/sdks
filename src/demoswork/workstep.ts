import forge from "node-forge"

import { getNewUID } from "./utils"
import { Hashing } from "@/encryption"
import { HexToForge } from "@/utils/dataManipulation"

import { DataTypes } from "@/types/demoswork/types"
import { WorkStepInput } from "@/types/demoswork/steps"
import { Web2Request } from "@/types/demoswork/web2"

export class WorkStep {
    type: string
    workUID: string
    input: WorkStepInput
    output: any
    description: string
    // hash: string
    signature: Uint8Array
    // output: DemosXmStepOutput

    constructor(input: WorkStepInput) {
        this.input = input
        this.workUID = getNewUID()
    }

    get hash() {
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

    constructor(payload: Web2Request) {
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

    constructor(payload: "payload") {
        super(payload)
    }
}
