import { ConditionalOperationScript } from "@/types/demoswork/operations"
import { compare, getValue } from "../utils"
import { DemosWork } from "../work"
import { executeStep, getStepResult } from "./stepexecutor"

export default async function (work: DemosWork, operation: ConditionalOperationScript) {
    for (const condition of operation.conditions) {
        // INFO: operator will be null if the value is pre-computed
        // or if the condition is an else block
        if (condition.operator === null) {
            // else condition block has no value
            if (condition.data === null) {
                await executeStep(work, condition.do)
                continue
            }

            // Pro-computed value
            if (condition.data) {
                await executeStep(work, condition.do)
            }
            continue
        }

        const result = await getStepResult(work, condition.workUID)
        const resolvedValue = getValue(result, condition.key)

        console.log(
            `Comparing resolved value: ${resolvedValue}, with condition value: ${condition.data}, using operator: ${condition.operator}`,
        )

        if (compare(resolvedValue, condition.data, condition.operator)) {
            await executeStep(work, condition.do)
        }
    }
}
