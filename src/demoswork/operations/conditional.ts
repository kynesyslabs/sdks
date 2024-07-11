import { Operation } from "."
import { WorkStep } from "../workstep"

import { DemoScript } from "@/types/demoswork"
import { OperationType } from "@/types/demoswork/operations"

// NOTE: A conditional type is the one that goes into the script
import {
    Conditional as C,
    Condition,
    StepOutputKey,
} from "@/types/demoswork/steps"
import { operators } from "@/types/demoswork/types"

export class Conditional extends Operation {
    override operationScript: {
        operationUID: string
        operationType: OperationType
        conditions: C[]
    }

    // INFO: A condition can be a boolean (pre-computed) or a condition object (to be computed on runtime)
    // REVIEW: if the condition is a boolean false, then it will never be executed. So, can we omit it from the script?
    constructor(script: DemoScript, condition: boolean | Condition) {
        super(script)
        this.operationScript.operationType = "conditional"

        if (typeof condition === "object") {
            console.log("inside conditional", condition)
            this.addStep(condition.step)
        }

        this.operationScript = {
            ...this.operationScript,
            conditions: [],
        }
        this.appendCondition(condition)
        this.writeToScript()
    }

    appendCondition(condition: boolean | Condition) {
        // INFO: If the condition is a boolean, create a value only condition
        if (typeof condition === "boolean") {
            return this.operationScript.conditions.push({
                operator: null,
                key: null,
                value: condition,
                stepUID: null,
                do: null,
            })
        }

        // INFO: If the condition is an object, create a condition object
        return this.operationScript.conditions.push({
            operator: condition.operator,
            key: condition.key,
            value: condition.value,
            stepUID: condition.step.workUID,
            do: {
                type: "step",
                uid: null,
            },
        })
    }

    writeToScript() {
        this.script.operations[this.operationScript.operationUID] =
            this.operationScript
        this.script.operationOrder.add(this.operationScript.operationUID)
        // TODO: Remove all step outputs
    }

    then(step: WorkStep) {
        this.addStep(step)
        const op_length = this.operationScript.conditions.length
        this.operationScript.conditions[op_length - 1].do = {
            type: "step",
            uid: step.workUID,
        }
        this.writeToScript()

        return {
            elif: this.elif.bind(this),
            else: this.else.bind(this),
        }
    }

    elif(conditon: boolean): Conditional
    elif(
        condition: boolean | StepOutputKey,
        operator?: operators,
        value?: any,
    ): Conditional
    elif(
        condition: boolean | StepOutputKey,
        operator?: operators,
        value?: any,
    ) {
        let conditionEntry = null

        if (typeof condition === "object") {
            console.log("inside conditional", condition)
            this.addStep(condition.src.step)

            conditionEntry = {
                key: condition.src.key,
                operator: operator,
                step: condition.src.step,
                value: value,
            }
        } else {
            conditionEntry = condition
        }

        this.appendCondition(conditionEntry)

        return {
            then: this.then.bind(this),
        }
    }

    else(step: WorkStep) {
        this.addStep(step)
        this.operationScript.conditions.push({
            operator: null,
            key: null,
            value: null,
            stepUID: null,
            do: {
                type: "step",
                uid: step.workUID,
            },
        })

        this.writeToScript()
    }
}
