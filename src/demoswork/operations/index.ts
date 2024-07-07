import { XmScript } from "@/types/demoswork"
import { OperationScript, OperationType } from "@/types/demoswork/operations"

import { getNewUID } from "../utils"
import { WorkStep } from "../workstep"

export class Operation {
    script: XmScript
    operationScript: OperationScript = {
        operationUID: "",
        operationType: <OperationType>"",
    }

    constructor(script: XmScript) {
        this.script = script
        this.operationScript.operationUID = getNewUID()
    }

    addStep(step: WorkStep) {
        console.log('step', step)
        this.script.steps[step.workUID] = step
    }

    execute() {
        throw new Error("Method not implemented.")
    }
}
