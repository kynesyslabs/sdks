import {
    Condition,
    Conditional,
    WorkStepOutput,
    XmScript,
} from "@/demoswork/types"
import { getNewUID } from "./utils"
import { WorkStep } from "./workstep"

export class DemosWork {
    #iscript: XmScript = {
        operationOrder: new Set<string>(),
        operations: {},
        steps: {},
    }
    results: Map<string, WorkStepOutput> = new Map()
    steps: WorkStep[]

    constructor(steps: WorkStep[] = []) {
        this.steps = steps
    }

    get script() {
        let script = this.#iscript
        script.steps = this.steps.reduce((acc, step) => {
            delete step.output
            acc[step.workUID] = step
            return acc
        }, {} as { [key: string]: WorkStep })

        return script
    }

    add(step: WorkStep) {
        this.steps.push(step)
    }

    if(condition: Condition) {
        // INFO: 1. Index the work step
        this.steps.push(condition.step)

        // INFO: 2. Start building the if_script
        let if_script = {
            operationUID: getNewUID(),
            operationType: "conditional",
            condition: {
                operator: condition.operator,
                key: condition.key,
                value: condition.value,
                stepUID: condition.step.workUID, // Run this step if the condition is true
            } as Conditional,
            elifs: <Conditional[]>[], // A list of conditions
            then: <string | null>null, // A workStep.workUID
            else: <string | null>null,
        }

        const elif = (elif_condition: Condition) => {
            // INFO: 3. Index this "elif" condition
            this.steps.push(elif_condition.step)

            // INFO: 4. Extend the elifs list of the if_script
            if_script.elifs.push({
                operator: elif_condition.operator,
                key: elif_condition.key,
                value: elif_condition.value,
                stepUID: elif_condition.step.workUID,
            })

            // INFO: 5. Allow chaining of elif and then
            return { then }
        }

        const then = (step: WorkStep) => {
            // NOTE: This is the closing step of the conditional operation
            // INFO: 6. Index the closing work step
            this.steps.push(step)

            // INFO: 7. Extend the if_script with the "then" step
            if_script.then = step.workUID

            // INFO: 8. Close operation by adding the if_script to the work script
            this.#iscript.operations[if_script.operationUID] = if_script
            this.#iscript.operationOrder.add(if_script.operationUID)

            return { elif, else_ }
        }

        const else_ = (step: WorkStep) => {
            this.steps.push(step)
            if_script.else = step.workUID

            // TODO: 9. Update the work script with the final if_script containing the else step
        }

        // INFO: 10. Allow chaining of if, elif and then
        return { then }
    }

    toJSON() {
        let script = this.script
        // @ts-expect-error
        script.operationOrder = [...script.operationOrder]
        return JSON.stringify(script, null, 2)
    }
}
