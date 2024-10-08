import { WorkStep } from "@/demoswork"
import { getNewUID } from "@/demoswork/utils"
import { ICondition, operators, DataTypes } from "@/types"
import { DemosWorkOutputKey } from "@/types/demoswork"
import { Operand } from "@/types/demoswork/steps"
import { DemosWorkOperation } from ".."
import {
    BinaryConditionParams,
    UnaryConditionParams,
    ConditionParams,
} from "@/types/demoswork/operations"

export class Condition implements ICondition {
    id: string = "cond_" + getNewUID()
    action: WorkStep | DemosWorkOperation = null
    value_a: Condition | Operand = null
    value_b: Condition | Operand = null
    operator: operators
    work: Map<string, WorkStep | DemosWorkOperation> = new Map()

    // INFO: The constructor is overloaded to handle both binary and unary conditions
    constructor(params: BinaryConditionParams)
    constructor(params: UnaryConditionParams)
    constructor(params: ConditionParams) {
        this.action = params.action
        this.operator = params.operator
        this.value_a = this.parseData(params.value_a)

        // INFO: If the operator is "not", there should be no operand
        if (params.operator !== "not") {
            this.value_b = this.parseData(params.value_b)
        }
    }

    parseData(data: DemosWorkOutputKey | any) {
        // INFO: Converts the conditional data to the script format
        if (data instanceof Condition) {
            // INFO: Copy condition work to this condition

            if (data.work) {
                for (const work of data.work.values()) {
                    this.work.set(work.id, work)
                }
            }

            return data
        }

        try {
            // check "type" key in data
            if (data.type && data.type === DataTypes.work) {
                this.work.set(data.src.self.id, data.src.self)

                return {
                    type: DataTypes.internal as DataTypes.internal,
                    workUID: data.src.self.id,
                    key: data.src.key,
                }
            }
        } catch (error) {
            console.log("Static data:", data)
        }

        // INFO: If the data is not a work output, it is a static value
        return {
            type: DataTypes.static as DataTypes.static,
            value: data,
        }
    }
}
