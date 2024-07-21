import { XMScript } from "../xm"
import { DataTypes, operators } from "./datatypes"

import { DemosWorkOperation } from "@/demoswork"
import { WorkStep } from "@/demoswork/workstep"
import { DemosWorkOutputKey } from "."
import { INativePayload } from "../native"
import { IWeb2Request } from "../web2"

interface BaseCondition {
    operator: operators
    operand:
        | {
              type: DataTypes.static
              value: any
          }
        | {
              type: DataTypes.internal
              workUID: string
              key: string
          }
        | DemosWorkOutputKey
    data:
        | {
              type: DataTypes.static
              value: any
          }
        | {
              type: DataTypes.internal
              workUID?: string
              key?: string
          }
        | DemosWorkOutputKey
}

/**
 * The shape of the condition
 * that is used in `DemosWork.if` and friends
 */
export interface ICondition extends BaseCondition {
    action: WorkStep | DemosWorkOperation
}

/**
 * The shape of the conditional operation
 * on the conditional script.
 */
export interface Conditional extends BaseCondition {
    work: string
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
