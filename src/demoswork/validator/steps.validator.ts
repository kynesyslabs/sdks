import { DataTypes } from "@/types"
import { DemoScript } from "@/types/demoswork"
import {
    ConditionalOperationScript,
    DemosWorkOperationScripts,
} from "@/types/demoswork/operations"
import { Operand } from "@/types/demoswork/steps"

function getMappedScriptSteps(script: DemoScript) {
    // return a map of step ids mapped to their descriptions
    return new Map(
        Object.keys(script.steps).map(step => [
            step,
            script.steps[step].description,
        ]),
    )
}

function getConditionalScriptSteps(script: ConditionalOperationScript) {
    let steps = new Set<string>()

    // INFO: Loop through all conditions and add the step to the set
    script.conditions.forEach(condition => {
        const parseValue = (value: Operand | null) => {
            if (
                value &&
                value.type === DataTypes.internal &&
                value.workUID.startsWith("step_")
            ) {
                steps.add(value.workUID)
            }
        }

        parseValue(condition.value_a)
        parseValue(condition.value_b)

        if (condition.work && condition.work.startsWith("step_")) {
            steps.add(condition.work)
        }
    })

    return steps
}

function catchNotIncluded(
    steps: Set<string>,
    scriptSteps: Map<string, string>,
    message: string = "",
) {
    let diff = new Set(Array.from(steps).filter(x => !scriptSteps.has(x)))

    if (diff.size > 0) {
        throw new Error(
            `Steps ${[...diff]} not included in final script - ${message}`,
        )
    }
}

function extractStepsFromOperation(
    operation: DemosWorkOperationScripts,
    scriptSteps: Map<string, string>,
) {
    let steps = new Set<string>()

    switch (operation.operationType) {
        case "conditional":
            let conditionalSteps = getConditionalScriptSteps(operation)
            steps = new Set([...steps, ...conditionalSteps])
            break

        case "base":
            let baseSteps = new Set(
                operation.work.filter(step => step.startsWith("step_")),
            )
            steps = new Set([...steps, ...baseSteps])
            break
    }

    catchNotIncluded(
        steps,
        scriptSteps,
        `${operation.operationType} - ${operation.id}`,
    )
    return steps
}

function collectAllSteps(script: DemoScript, scriptSteps: Map<string, string>) {
    let steps = new Set<string>()

    Object.keys(script.operations).forEach(opUID => {
        let operation = script.operations[opUID]
        steps = new Set([...steps, ...extractStepsFromOperation(operation, scriptSteps)])
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
    let scriptSteps = getMappedScriptSteps(script)
    let steps = collectAllSteps(script, scriptSteps)

    for (const id of scriptSteps.keys()) {
        if (!steps.has(id)) {
            throw new Error(
                `Step ${scriptSteps.get(id) || id} not used in script`,
            )
        }
    }
}
