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
        // remove all step outputs
        for (const stepUID in script.steps) {
            delete script.steps[stepUID].output
            delete script.steps[stepUID].workUID
        }

        // remove all operation uids
        for (const opUID in script.operations) {
            delete script.operations[opUID].operationUID
        }

        return script
    }
}
