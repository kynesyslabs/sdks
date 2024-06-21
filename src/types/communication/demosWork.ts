import * as forge from "node-forge"
import { XMPayload } from "../blockchain/Transaction"
import { Web2Payload } from "../blockchain/Transaction"

// Strictly declaring the type of a step of a demosWork enables us to
// easily manage the various steps with the appropriate types.
export type XMStep = {
    context: "xm",
    payload: XMPayload,
}
export type Web2Step = {
    context: "web2",
    payload: Web2Payload,
}
export type NativeStep = {
    context: "native",
    payload: any,
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