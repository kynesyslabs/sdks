import { ConditionalOperation, DemosWorkOperation } from "@/demoswork"
import { Conditional } from "./steps"
import { DataTypes } from "./datatypes"

export type OperationType = "conditional" | "loop" | "operation" | "function" | "base"
export interface OperationScript {
    id: string
    operationType: OperationType
}

export interface ConditionalOperationScript extends OperationScript {
    operationType: "conditional"
    conditions: Conditional[]
}

export interface BaseOperationScript extends OperationScript {
    operationType: "base"
    work: Array<string>
}

// INFO: All types of operation classes
export type DemosWorkOperations = DemosWorkOperation | ConditionalOperation | BaseOperationScript

// INFO: All types of operation scripts
export type DemosWorkOperationScripts = ConditionalOperationScript | BaseOperationScript

export interface OperationOutputKey {
    type: DataTypes.work
    src: {
        self: DemosWorkOperation
        key: string
    }
}
