import { WorkStep } from "@/demoswork/workstep"
import { DemosWorkOperationScripts } from "./operations"

/**
 * The final shape of the work script
 */
export interface DemoScript {
    operationOrder: Set<string>
    operations: { [key: string]: DemosWorkOperationScripts }
    steps: { [key: string]: WorkStep }
}

