import { DemosWork } from "../work"

/**
 * Execute a step and write the output to the work instance.
 *
 * @param work The work instance
 * @param stepUID The UID of the step to execute
 * @returns The result of the step
 */
export async function executeStep(work: DemosWork, stepUID: string) {
    // INFO: Execute the step here and write the output to the work instance.
    // Process:
    // 1. Find the step from work.steps map
    // 2. Determine the type of the step
    // 3. Route execution to the appropriate executor function (TODO)
    // 4. Write the output to the work instance

    // REVIEW: Which is better?
    // Pass the work instance to this function and write the output to the work instance from here,
    // OR:
    // Pass the actual step to this function and return the output to the caller?

    console.log("Executing step", stepUID)
    work.results[stepUID] = {
        output: {
            result: "error",
            statusCode: 200,
            payload: {
                message: "Hello, World!",
            },
        },
    }
    // ! Compile the result and return it

    return work.results[stepUID]
}

/**
 * Get the result of a step from the work instance.
 * If not found, execute the step and return the result.
 *
 * @param work The work instance
 * @param stepUID The step UID
 * @returns The result of the step
 */
export async function getStepResult(work: DemosWork, stepUID: string) {
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
