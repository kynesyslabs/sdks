import { DemoScript } from "@/types/demoswork";
import { noUnusedSteps } from "./steps.validator";

/**
 * Validates a work script. Checks for common errors.
 * 
 * @param work The work script to validate
 */
export function runSanityChecks(script: DemoScript) {
    noUnusedSteps(script)
}
