import { DemoScript } from "@/types/demoswork"
import { OperationScript, OperationType } from "@/types/demoswork/operations"

import { getNewUID } from "../utils"
import { WorkStep } from "../workstep"

export class Operation {
    script: DemoScript
    operationScript: OperationScript = {
        operationUID: "",
        operationType: <OperationType>"",
    }

    constructor(script: DemoScript) {
        this.script = script
        this.operationScript.operationUID = getNewUID()
    }

    addStep(step: WorkStep) {
        this.script.steps[step.workUID] = step
    }

    execute() {
        throw new Error("Method not implemented.")
    }
}
