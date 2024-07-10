import { DemoScript } from "@/types/demoswork";
import { noUnusedSteps } from "./steps.validator";

/**
 * Validates a work script. Checks for common errors.
 * 
 * @param work The work script to validate
 */
export default function (script: DemoScript) {
    noUnusedSteps(script)
}
