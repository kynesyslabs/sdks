import { WorkStep } from "@/demoswork/workstep"
import { DemosWorkOperationScripts, OperationOutputKey } from "./operations"
import { StepOutputKey } from "./steps"

/**
 * The final shape of the work script
 */
export interface DemoScript {
    operationOrder: Set<string>
    operations: { [key: string]: DemosWorkOperationScripts }
    steps: { [key: string]: WorkStep }
}


export type DemosWorkOutputKey = OperationOutputKey | StepOutputKey