import { DemosWorkOperation } from ".."
import { Condition, WorkStep } from "../.."
import {
    OperationType,
    ConditionalOperationScript,
    operators,
    DataTypes,
} from "../../types"
import { DemosWorkOutputKey, Operand } from "../../types"

export class ConditionalOperation extends DemosWorkOperation {
    override type: OperationType = "conditional"
    tempCondition: Condition = null

    override operationScript: ConditionalOperationScript = {
        id: this.id,
        operationType: "conditional",
        critical: true,
        depends_on: [],
        conditions: new Map(),
        order: [],
    }

    constructor(...conditions: Condition[]) {
        super()
        for (const condition of conditions) {
            this.appendCondition(condition)
        }
    }

    indexCondition(condition: Condition) {
        // INFO: copy condition action to the operation
        if (condition.action) {
            this.addWork(condition.action)
        }

        this.operationScript.conditions.set(condition.id, {
            operator: condition.operator,
            value_a: this.parseConditionValue(condition.value_a),
            value_b: this.parseConditionValue(condition.value_b),
            ... (condition.action ? { work: condition.action.id } : {}),
        })

        return {
            type: DataTypes.internal as DataTypes.internal,
            workUID: condition.id,
            key: "output.result",
        }
    }

    parseConditionValue(value: Operand | Condition) {
        // converts condition values into the script format
        if (value instanceof Condition) {
            this.indexCondition(value)

            return {
                type: DataTypes.internal as DataTypes.internal,
                workUID: value.id,
                key: null,
            }
        }

        return value
    }

    appendCondition(condition: Condition) {
        for (const work of condition.work.values()) {
            this.addWork(work)
        }
        delete condition.work

        const entry = {
            operator: condition.operator,
            value_a: this.parseConditionValue(condition.value_a),
            value_b: this.parseConditionValue(condition.value_b),
        }

        // if there is an action, the condition comes from the constructor
        // ie. is a fully formed condition.
        this.addWork(condition.action)
        this.operationScript.conditions.set(condition.id, {
            ...entry,
            ... (condition.action ? { work: condition.action.id } : {})
        })
        return this.operationScript.order.push(condition.id)
    }

    // SECTION: CONDITIONAL OPERATION METHODS

    if(
        value_a: DemosWorkOutputKey | any,
        operator: operators,
        value_b?: DemosWorkOutputKey | any,
    ) {
        let conditionEntry = new Condition({
            action: null,
            value_a: value_a,
            value_b: value_b,
            operator: operator as any,
        })

        this.tempCondition = conditionEntry
        return {
            then: this.then.bind(this),
        }
    }

    then(step: WorkStep | DemosWorkOperation) {
        // update the last item in the temp conditions
        // and push it to the operation script
        this.tempCondition.action = step
        this.appendCondition(this.tempCondition)
        this.tempCondition = null

        return {
            elif: this.if.bind(this),
            else: this.else.bind(this),
        }
    }

    else(step: WorkStep | DemosWorkOperation) {
        const condition = new Condition({
            operator: null,
            value_a: null,
            value_b: null,
            action: step,
        })

        // INFO: Override value formatting
        condition.value_a = null
        condition.value_b = null

        return this.appendCondition(condition)
    }
}
