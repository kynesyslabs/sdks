import { WorkStep } from "@/demoswork/workstep"

// SECTION: XM
/**
 * A xm step can either be successful or error
 */
export enum XmStepResult {
    success = "success",
    error = "error",
}

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

// SECTION: WEB2
// =============================================================================

/**
 * Assume this is how a web2 request looks like
 */
export interface Web2Request {
    url: string
    method: "GET" | "POST" | "PUT" | "DELETE"
    data?: Object
}

interface DemosWeb2StepOutput {
    statusCode: number
    payload: Object
}

// SECTION: WORK STEPS

export interface WorkStepInput {
    type: "xm" | "web2"
    payload: "payload" | Web2Request
}

enum stepKeysEnum {
    "output.result" = "output.result",
    "output.hash" = "output.hash",
    // others here
}

export type WorkStepOutput = DemosXmStepOutput | DemosWeb2StepOutput

export type stepKeys = keyof typeof stepKeysEnum

/**
 * The final shape of the work script
 */
export interface XmScript {
    operationOrder: Set<string>
    operations: { [key: string]: any }
    steps: { [key: string]: WorkStep }
}

/**
 * The shape of the condition
 * that is used in `DemosWork.if` and friends
 */
export interface Condition {
    step: WorkStep
    operator: string
    key: string
    value: any
}

/**
 * The shape of the conditional operation
 * on the if_script
 */
export interface Conditional {
    operator: string
    key: string
    value: any
    stepUID: string
    do: string
}
