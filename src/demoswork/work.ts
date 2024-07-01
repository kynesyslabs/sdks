import { Condition, WorkStepOutput, XmScript } from "@/demoswork/types"
import { WorkStep } from "./workstep"
import { Conditional } from "./operations/conditional"

export class DemosWork {
    script: XmScript = {
        operationOrder: new Set<string>(),
        operations: {},
        steps: {},
    }
    results: Map<string, WorkStepOutput> = new Map()
    steps: WorkStep[]

    constructor(steps: WorkStep[] = []) {
        this.steps = steps
    }

    if(condition: Condition) {
        return new Conditional(this.script, condition)
    }

    toJSON() {
        let script = this.script
        // @ts-expect-error
        script.operationOrder = [...script.operationOrder]
        return JSON.stringify(script, null, 2)
    }
}
