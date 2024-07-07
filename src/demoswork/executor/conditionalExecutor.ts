import { ConditionalScript } from "@/types/demoswork/operations"
import { DemosWork } from "../work"
import { executeStep } from "./stepexecutor"
import { compare, getValue } from "../utils"

async function getStepResult(work: DemosWork, stepUID: string) {
    let result = work.results[stepUID]

    if (result) {
        return result
    }

    // INFO: If the step result is not found, execute the step
    console.log(
        `Step with UID ${stepUID} not found in work results. Executing it now.`,
    )
    return await executeStep(work, stepUID)
}

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
