import { DemosWorkOperation } from "."
import { WorkStep } from "../workstep"

import { OperationType } from "@/types/demoswork/operations"

// NOTE: A conditional type is the one that goes into the script
import { DemosWorkOutputKey } from "@/types/demoswork"
import { DataTypes, operators } from "@/types/demoswork/datatypes"
import { Condition, Conditional } from "@/types/demoswork/steps"

export class ConditionalOperation extends DemosWorkOperation {
    // INFO: A conditional in the making
    tempConditions: Conditional[] = []
    override operationScript: {
        id: string
        operationType: OperationType
        conditions: Conditional[]
    }

    override output = {
        success: {
            type: DataTypes.internal,
            src: {
                self: this as DemosWorkOperation,
                key: "output.success",
            },
        },
    }

    constructor() {
        super()
        this.operationScript.operationType = "conditional"
        this.operationScript = {
            ...this.operationScript,
            conditions: [],
        }
    }

    // INFO: A condition can be a boolean (pre-computed) or a condition object (to be computed on runtime)
    // REVIEW: if the condition is a boolean false, then it will never be executed. So, can we omit it from the script?
    // public if(conditon: boolean): any
    // public if(
    //     condition: DemosWorkOutputKey,
    //     operator?: operators,
    //     value?: any,
    // ): any
    if(
        condition: boolean | DemosWorkOutputKey,
        operator?: operators,
        value?: any,
    ) {
        let conditionEntry: boolean | Condition

        if (typeof condition === "object") {
            console.log("inside conditional", condition)
            this.addWork(condition.src.self)
            conditionEntry = {
                key: condition.src.key,
                operator: operator,
                action: condition.src.self,
                data: value,
            }
        } else {
            conditionEntry = condition
        }

        this.appendCondition(conditionEntry)

        return {
            then: this.then.bind(this),
        }
    }

    appendCondition(condition: boolean | Condition) {
        // INFO: If the condition is a boolean, create a value only condition
        if (typeof condition === "boolean") {
            return this.operationScript.conditions.push({
                operator: null,
                key: null,
                data: condition,
                workUID: null,
                do: null,
            })
        }

        if (condition.data["type"] === DataTypes.internal) {
            this.addWork(condition.action)
            condition.data = {
                type: DataTypes.internal,
                workUID: condition.data.src.self.id,
                key: condition.data.src.key,
            }
        } else {
            condition.data = {
                type: DataTypes.static,
                value: condition.data,
            }
        }

        // INFO: If the condition is an object, create a condition object
        return this.tempConditions.push({
            operator: condition.operator,
            key: condition.key,
            data: condition.data,
            workUID: condition.action.id,
            do: null,
        })
    }

    then(step: WorkStep | DemosWorkOperation) {
        this.addWork(step)
        const op_length = this.tempConditions.length
        this.tempConditions[op_length - 1].do = step.id
        this.operationScript.conditions.push(this.tempConditions.pop())

        return {
            elif: this.elif.bind(this),
            else: this.else.bind(this),
        }
    }

    // elif(condition: boolean): any
    // elif(
    //     condition: boolean | DemosWorkOutputKey,
    //     operator?: operators,
    //     value?: any,
    // ): any
    elif(
        condition: boolean | DemosWorkOutputKey,
        operator?: operators,
        value?: any,
    ) {
        let conditionEntry: boolean | Condition = null

        if (typeof condition === "object") {
            this.addWork(condition.src.self)

            conditionEntry = {
                key: condition.src.key,
                operator: operator,
                action: condition.src.self,
                data: value,
            }
        } else {
            conditionEntry = condition
        }

        this.appendCondition(conditionEntry)

        return {
            then: this.then.bind(this),
        }
    }

    else(step: WorkStep | DemosWorkOperation) {
        this.addWork(step)
        this.operationScript.conditions.push({
            operator: null,
            key: null,
            data: null,
            workUID: null,
            do: step.id,
        })
    }
}
