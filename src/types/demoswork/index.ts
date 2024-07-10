import { WorkStep } from "@/demoswork/workstep"
import { AnyOperation } from "./operations"

/**
 * The final shape of the work script
 */
export interface DemoScript {
    operationOrder: Set<string>
    operations: { [key: string]: AnyOperation }
    steps: { [key: string]: WorkStep }
}