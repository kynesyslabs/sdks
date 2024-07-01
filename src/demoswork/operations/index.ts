import { XmScript } from "../types";
import { getNewUID } from "../utils";
import { WorkStep } from "../workstep";

export type OperationType = "conditional" | "loop" | "operation" | "function"

export class Operation {
    script: XmScript
    operationScript = {
        operationUID: "",
        operationType: <OperationType>"",
    }

    addStep(step: WorkStep){
        this.script.steps[step.workUID] = step
    }

    constructor(script: XmScript){
        this.script = script
        this.operationScript.operationUID = getNewUID()
    }
}