import { WorkStep } from "@/demoswork/workstep"

/**
 * The final shape of the work script
 */
export interface XmScript {
    operationOrder: Set<string>
    operations: { [key: string]: any }
    steps: { [key: string]: WorkStep }
}
