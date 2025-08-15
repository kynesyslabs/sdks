import { DemoScript } from "@kynesyslabs/types"
import { noUnusedSteps } from "./steps.validator"
import { WorkStep } from "../workstep"
import { OperationScript } from "@kynesyslabs/types"

function dependsOnIsAnArrayOfWorkUIDs(script: DemoScript): void {
    const validPrefixes = ["step_", "op_"]
    const errors: string[] = []
    const allWorkUIDs = new Set([
        ...Object.keys(script.operations),
        ...Object.keys(script.steps),
    ])

    function checkDependencies(
        item: OperationScript | WorkStep,
        itemType: string,
    ): void {
        const invalidDep = item.depends_on.find(
            dep => !validPrefixes.some(prefix => dep.startsWith(prefix)),
        )

        if (invalidDep) {
            errors.push(
                `${itemType} ${
                    // @ts-ignore
                    item.description || item.id
                } depends on an invalid work UID: ${invalidDep}`,
            )
        }

        item.depends_on.forEach(dep => {
            if (!allWorkUIDs.has(dep)) {
                errors.push(
                    `${itemType} ${item.id} depends on a non-existent work UID: ${dep}`,
                )
            }
        })
    }

    Object.entries(script.operations).forEach(([key, operation]) =>
        checkDependencies({ ...operation, id: key }, "Operation"),
    )
    Object.entries(script.steps).forEach(([key, step]) =>
        checkDependencies({ ...step, id: key } as WorkStep, "Step"),
    )

    if (errors.length > 0) {
        throw new Error("Invalid dependencies found:\n" + errors.join("\n"))
    }
}

/**
 * Validates a work script. Checks for common errors.
 *
 * @param work The work script to validate
 */
export function runSanityChecks(script: DemoScript) {
    noUnusedSteps(script)
    dependsOnIsAnArrayOfWorkUIDs(script)
    // TODO: Add check to ensure operation reference order does not conflict with
    // defined operations order in the final script
    // TODO: Check for circular references!
}
