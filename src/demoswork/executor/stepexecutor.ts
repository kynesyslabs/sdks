import { DemosWork } from "../work"

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

    return work.results[stepUID]
}
