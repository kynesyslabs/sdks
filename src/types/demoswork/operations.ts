import { Conditional } from "./steps"

export type OperationType = "conditional" | "loop" | "operation" | "function"
export interface OperationScript {
    operationUID: string
    operationType: OperationType
}

export interface ConditionalOperationScript extends OperationScript {
    conditions: Conditional[]
}

export type DemosWorkOperationScripts = ConditionalOperationScript