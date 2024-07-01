import pprint from "@/utils/pprint"
import { Operation, OperationType } from "."
import { Condition, XmScript, Conditional as C } from "../types"
import { WorkStep } from "../workstep"

export class Conditional extends Operation {
    override operationScript: {
        operationUID: string
        operationType: OperationType
        conditions: C[]
    }

    constructor(script: XmScript, condition: Condition) {
        super(script)
        this.operationScript.operationType = "conditional"

        this.addStep(condition.step)
        this.operationScript = {
            ...this.operationScript,
            conditions: [],
        }
        this.appendCondition(condition)
        this.writeToScript()
    }

    appendCondition(condition: Condition) {
        this.operationScript.conditions.push({
            operator: condition.operator,
            key: condition.key,
            value: condition.value,
            stepUID: condition.step.workUID,
            do: null,
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
        this.operationScript.conditions[op_length - 1].do = step.workUID
        this.writeToScript()

        return {
            elif: this.elif,
            else: this.else,
        }
    }

    elif(condition: Condition) {
        // "this" here does not refer to the Conditional instance
        // It refers to the object returned by the "then" method
        // TODO: Fix this!
        this.addStep(condition.step)
        this.appendCondition(condition)

        return {
            then: this.then,
        }
    }

    else(step: WorkStep) {
        this.addStep(step)
        this.operationScript.conditions.push({
            operator: null,
            key: null,
            value: null,
            stepUID: step.workUID,
            do: null,
        })

        this.writeToScript()

        // this.script.operations[this.operationScript.operationUID] =
        //     this.operationScript
        // this.script.operationOrder.add(this.operationScript.operationUID)
    }
}
