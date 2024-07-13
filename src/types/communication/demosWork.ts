import * as forge from "node-forge"
import { XMScript } from "../xm"
import { IWeb2Request } from "../web2"
import { INativePayload } from "../native"

// Strictly declaring the type of a step of a demosWork enables us to
// easily manage the various steps with the appropriate types.
export type XMStep = {
    context: "xm",
    payload: XMScript,
}
export type Web2Step = {
    context: "web2",
    payload: IWeb2Request,
}
export type NativeStep = {
    context: "native",
    payload: INativePayload,
}
// Here we define the type of a demosWork based on the type of the steps.
export type demosStepType = XMStep | Web2Step | NativeStep

// The content of a single step of a demosWork
export interface demosStepContent {
    workUID: string
    type: demosStepType,
}

// A single step of a demosWork
export interface demosStep {
    content: demosStepContent,
    signature: forge.pki.ed25519.BinaryBuffer // ? Unsure about this
}

// An aggregate of demosStep
export interface demosWork {
    workUID: string,
    steps: demosStep[],
}

// Return interface for demosWork
export interface demosResult {
    workUID: string,
    results: any[], // ! Obviously this is just a draft
    signature: forge.pki.ed25519.BinaryBuffer,
}