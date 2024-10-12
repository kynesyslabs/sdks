import { ConditionalOperation, DemosWorkOperation, WorkStep } from "@/demoswork"
import { Conditional } from "./steps"
import { DataTypes, operators } from "./datatypes"
import { DemosWorkOutputKey } from "."

export type OperationType =
    | "conditional"
    | "base"
    // | "loop"
    // | "operation"
    // | "function"
export interface OperationScript {
    id: string
    operationType: OperationType
}

// SECTION: CONDITIONAL OPERATION

/**
 * The shape of the parameters for a condition
 * that has only one operand and an operator.
 * ie. The logical NOT operator.
 */
export type UnaryConditionParams = {
    action?: WorkStep | DemosWorkOperation | null
    value_a: DemosWorkOutputKey | any
    operator: "not"
}

/**
 * The shape of the parameters for a condition
 * that has two operands and an operator.
 */
export type BinaryConditionParams = {
    action?: WorkStep | DemosWorkOperation | null
    value_a: DemosWorkOutputKey | any
    value_b: DemosWorkOutputKey | any
    operator: Exclude<operators, "not">
}

export type ConditionParams = BinaryConditionParams | UnaryConditionParams

export interface ConditionalOperationScript extends OperationScript {
    operationType: "conditional"
    conditions: Map<string, Conditional>
    order: string[]
}

// SECTION: BASE OPERATION

export interface BaseOperationScript extends OperationScript {
    operationType: "base"
    order: string[]
}

// SECTION: GENERAL

// INFO: All types of operation classes
export type DemosWorkOperations =
    | DemosWorkOperation
    | ConditionalOperation
    | BaseOperationScript

// INFO: All types of operation scripts
export type DemosWorkOperationScripts =
    | ConditionalOperationScript
    | BaseOperationScript

export interface OperationOutputKey {
    type: DataTypes.work
    src: {
        self: DemosWorkOperation
        key: string
    }
}
