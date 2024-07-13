import { XMScript } from "../xm"
import { DataTypes, operators } from "./datatypes"

import { WorkStep } from "@/demoswork/workstep"
import { IWeb2Request } from "../web2"
import { INativePayload } from "../native";

interface BaseCondition {
    operator: operators
    key: string
    value: any
}

/**
 * The shape of the condition
 * that is used in `DemosWork.if` and friends
 */
export interface Condition extends BaseCondition {
    step: WorkStep
}

/**
 * The shape of the conditional operation
 * on the conditional script.
 */
export interface Conditional extends BaseCondition {
    stepUID: string
    do: {
        type: "step"
        uid: string
    }
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
    type: DataTypes
    src: {
        step: WorkStep
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
