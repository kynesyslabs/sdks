import { DemoScript } from "@/types/demoswork";
import { noUnusedSteps } from "./steps.validator";

/**
 * Validates a work script. Checks for common errors.
 * 
 * @param work The work script to validate
 */
export function runSanityChecks(script: DemoScript) {
    noUnusedSteps(script)
    // TODO: Add check to ensure operation reference order does not conflict with
    // defined operations order in the final script
    // TODO: Check for circular references!
}
