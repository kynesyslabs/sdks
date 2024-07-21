import { DemosWorkOperation } from "."
import { WorkStep } from "../workstep"

import {
    ConditionalOperationScript,
    OperationType,
} from "@/types/demoswork/operations"

// NOTE: A conditional type is the one that goes into the script
import { DemosWorkOutputKey } from "@/types/demoswork"
import { DataTypes, operators } from "@/types/demoswork/datatypes"
import { Conditional, ICondition } from "@/types/demoswork/steps"

export class Condition implements ICondition {
    action: WorkStep | DemosWorkOperation
    data:
        | { type: DataTypes.static; value: any }
        | { type: DataTypes.internal; workUID?: string; key?: string }
    operand:
        | { type: DataTypes.static; value: any }
        | { type: DataTypes.internal; workUID: string; key: string }
    operator: operators
    work: (WorkStep | DemosWorkOperation)[] = []

    constructor({
        action,
        data,
        operand,
        operator,
    }: {
        action: WorkStep | DemosWorkOperation | null
        data: DemosWorkOutputKey | any
        operand: DemosWorkOutputKey | any
        operator: operators
    }) {
        this.action = action
        this.operator = operator
        this.data = this.parseData(data)
        this.operand = this.parseData(operand)
    }

    parseData(data: DemosWorkOutputKey | any) {
        // INFO: Converts the conditional data to the script format
        try {
            // check "type" key in data
            if (data.type && data.type === DataTypes.work) {
                this.work.push(data.src.self)

                return {
                    type: DataTypes.internal as DataTypes.internal,
                    workUID: data.src.self.id,
                    key: data.src.key,
                }
            }
        } catch (error) {
            console.error("Error parsing data", error)
            console.error("Data", data)
        }

        // INFO: If the data is not a work output, it is a static value
        return {
            type: DataTypes.static as DataTypes.static,
            value: data,
        }
    }
}

export class ConditionalOperation extends DemosWorkOperation {
    override type: OperationType = "conditional"
    tempConditions: Conditional[] = []

    override operationScript: ConditionalOperationScript = {
        id: this.id,
        operationType: "conditional",
        conditions: [],
    }

    constructor(...conditions: Condition[]) {
        super()
        for (const condition of conditions) {
            this.appendCondition(condition)
        }
    }

    if(
        condition: DemosWorkOutputKey | any,
        operator: operators,
        value: DemosWorkOutputKey | any,
    ) {
        let conditionEntry = new Condition({
            action: null,
            data: value,
            operand: condition,
            operator: operator,
        })

        console.log("conditionEntry", conditionEntry)
        this.appendCondition(conditionEntry)

        return {
            then: this.then.bind(this),
        }
    }

    appendCondition(condition: Condition) {
        console.log("Appending condition", condition)
        for (const work of condition.work) {
            this.addWork(work)
        }
        delete condition.work

        // if there is an action, the condition comes from the constructor
        // ie. is a fully formed condition.
        if (condition.action) {
            this.addWork(condition.action)

            const actionid = condition.action.id
            delete condition.action

            return this.operationScript.conditions.push({
                ...condition,
                work: actionid,
            })
        }

        return this.tempConditions.push({
            operator: condition.operator,
            operand: condition.operand,
            data: condition.data,
            work: null,
        })
    }

    then(step: WorkStep | DemosWorkOperation) {
        console.log("then", step)
        this.addWork(step)

        // update the last item in the temp conditions
        // and push it to the operation script
        const lastIndex = this.tempConditions.length
        this.tempConditions[lastIndex - 1].work = step.id
        this.operationScript.conditions.push(this.tempConditions.pop())

        return {
            elif: this.if.bind(this),
            else: this.else.bind(this),
        }
    }

    else(step: WorkStep | DemosWorkOperation) {
        this.addWork(step)
        this.operationScript.conditions.push({
            operator: null,
            operand: null,
            data: null,
            work: step.id,
        })
    }
}
