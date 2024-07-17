import { DemoScript } from "@/types/demoswork"
import { ConditionalOperationScript } from "@/types/demoswork/operations"

function getConditionalScriptSteps(script: ConditionalOperationScript) {
    let steps = new Set<string>()

    // INFO: Loop through all conditions and add the step to the set
    script.conditions.forEach(condition => {
        if (condition.workUID.startsWith("step_")) {
            steps.add(condition.workUID)
        }

        // Skip operation dos
        if (condition.do.startsWith("step_")) {
            steps.add(condition.do)
        }
    })

    return steps
}

function collectAllSteps(script: DemoScript) {
    let steps = new Set<string>()

    Object.keys(script.operations).forEach(opUID => {
        let operation = script.operations[opUID]

        switch (operation.operationType) {
            case "conditional":
                let conditonalSteps = getConditionalScriptSteps(operation)
                console.log("conditonalSteps", conditonalSteps)
                let scriptSteps = new Set(Object.keys(script.steps))

                // INFO: Assert that all steps in the conditional
                // script are included in the final script
                let diff = new Set(
                    Array.from(conditonalSteps).filter(
                        x => !scriptSteps.has(x),
                    ),
                )

                if (diff.size > 0) {
                    throw new Error(
                        `Steps ${[...diff]} not included in final script`,
                    )
                }

                steps = new Set([...steps, ...conditonalSteps])
                break
        }
    })

    return steps
}

/**
 * Assert that all steps in the script are consumed by operations
 *
 * @param script The work script to validate
 * @returns true if all steps are used, false otherwise
 */
export function noUnusedSteps(script: DemoScript) {
    // NOTES: Collect all steps in the script
    // and compare them to the script steps
    let steps = collectAllSteps(script)
    let scriptSteps = new Set(Object.keys(script.steps))

    let diff = new Set(Array.from(scriptSteps).filter(x => !steps.has(x)))

    if (diff.size > 0) {
        throw new Error(`Steps ${[...diff]} not used in script`)
    }
}
