import { DemosWork } from "../work"
import { compare, getValue } from "../utils"
import { executeStep, getStepResult } from "./stepexecutor"
import { ConditionalScript } from "@/types/demoswork/operations"

export default async function (work: DemosWork, operation: ConditionalScript) {
    for (const condition of operation.conditions) {
        // INFO: operator will be null if the value is pre-computed
        // or if the condition is an else block
        if (condition.operator === null) {
            // else condition block has no value
            if (condition.value === null) {
                await executeStep(work, condition.do.uid)
                continue
            }

            // Pro-computed value
            if (condition.value) {
                await executeStep(work, condition.do.uid)
            }
            continue
        }

        const result = await getStepResult(work, condition.stepUID)
        const resolvedValue = getValue(result, condition.key)

        console.log(
            `Comparing resolved value: ${resolvedValue}, with condition value: ${condition.value}, using operator: ${condition.operator}`,
        )

        if (compare(resolvedValue, condition.value, condition.operator)) {
            await executeStep(work, condition.do.uid)
        }
    }
}
