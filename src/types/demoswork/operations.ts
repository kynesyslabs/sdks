import { ConditionalOperation, DemosWorkOperation } from "@/demoswork"
import { Conditional } from "./steps"
import { DataTypes } from "./datatypes"

export type OperationType = "conditional" | "loop" | "operation" | "function"
export interface OperationScript {
    id: string
    operationType: OperationType
}

export interface ConditionalOperationScript extends OperationScript {
    conditions: Conditional[]
}

export type DemosWorkOperations = DemosWorkOperation | ConditionalOperation

export type DemosWorkOperationScripts = ConditionalOperationScript

export interface OperationOutputKey {
    type: DataTypes
    src: {
        self: DemosWorkOperation
        key: string
    }
}
