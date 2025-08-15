import { XMScript } from "@kimcalc/types"
import { DataTypes, operators } from "./datatypes"

import { Condition } from "../operations/conditional/condition"
import { DemosWorkOperation } from "../operations"
import { WorkStep } from "../workstep"
import { INativePayload } from "@kimcalc/types"
import { IWeb2Request } from "@kimcalc/types"

/**
 * The condition operand type
 *
 * This type is used to define the data type of the operands in a condition.
 * This can be either a static value (number, string, object, etc.) or an internal value (a reference to a work output).
 */
export type Operand =
    | { type: DataTypes.static; value: any }
    | { type: DataTypes.internal; workUID: string; key: string }

interface BaseCondition {
    operator: operators
}

/**
 * The shape of the condition
 * that is used in `DemosWork.if` and friends
 */
export interface ICondition extends BaseCondition {
    value_a: Condition | Operand
    value_b: Condition | Operand
    action: WorkStep | DemosWorkOperation
}

/**
 * The shape of the conditional operation
 * on the conditional script.
 */
export interface Conditional extends BaseCondition {
    id?: string
    value_b: Operand
    value_a: Operand
    work?: string
}
/**
 * Keys that can be used to refer to the output of a step
 */
export enum stepKeysEnum {
    "output.result" = "output.result",
    "output.hash" = "output.hash",
    // others here
}

export type stepKeys = keyof typeof stepKeysEnum
export type WorkStepInput = XMScript | IWeb2Request | INativePayload

/**
 * The object you get when you refer to the output of a step
 *
 * @example sendEther.output.result
 */
export interface StepOutputKey {
    type: DataTypes.work
    src: {
        self: WorkStep
        key: string
    }
}

/**
 * A xm step can either be a success or error
 */
export enum XmStepResult {
    success = "success",
    error = "error",
}
