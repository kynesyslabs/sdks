import { IOperation, XMScript } from "../xm"
import { operators } from "./types"

import { IWeb2Request } from "../web2"
import { DemosWeb2StepOutput } from "./web2"
import { WorkStep } from "@/demoswork/workstep"

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
 * on the if_script
 */
export interface Conditional extends BaseCondition {
    stepUID: string
    do: {
        type: "step"
        uid: string
    }
}

export enum stepKeysEnum {
    "output.result" = "output.result",
    "output.hash" = "output.hash",
    // others here
}

export type stepKeys = keyof typeof stepKeysEnum
export type WorkStepInput = XMScript | IWeb2Request | any
export type WorkStepOutput = DemosXmStepOutput | DemosWeb2StepOutput

/**
 * Assume a xm step that send some ether outputs and object of this shape
 */
export interface DemosXmStepOutput {
    stepUID: string
    result: XmStepResult

    /**
     * The hash of the sent transaction
     */
    hash: string
}

/**
 * A xm step can either be successful or error
 */
export enum XmStepResult {
    success = "success",
    error = "error",
}
