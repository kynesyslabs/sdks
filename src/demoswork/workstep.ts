import { Web2Request, WorkStepInput } from "@/demoswork/types"
import { getNewUID } from "./utils"

export class WorkStep {
    type: string
    workUID: string
    input: WorkStepInput
    output: any
    description: string
    // output: DemosXmStepOutput

    constructor(input: WorkStepInput) {
        this.type = input.type
        this.input = input
        this.workUID = getNewUID()
    }

    exec() {
        // INFO: Send payload or execute web2 request here
    }
}

enum OutputTypes {
    demosType = "internal",
}

export class Web2WorkStep extends WorkStep {
    override output = {
        statusCode: {
            type: OutputTypes.demosType,
            src: {
                stepUID: this.workUID,
                key: "output.statusCode",
            },
        },
        payload: {
            type: OutputTypes.demosType,
            src: {
                stepUID: this.workUID,
                key: "output.payload",
            },
        },
    }

    constructor(payload: Web2Request) {
        super({ type: "web2", payload })
    }
}

export class XmWorkStep extends WorkStep {
    override output = {
        result: {
            type: OutputTypes.demosType,
            src: {
                stepUID: this.workUID,
                key: "output.result",
            },
        },
        hash: {
            type: OutputTypes.demosType,
            src: {
                stepUID: this.workUID,
                key: "output.hash",
            },
        },
    }

    constructor(payload: "payload") {
        super({ type: "xm", payload })
    }
}
