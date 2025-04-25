import { pki } from "node-forge"

export interface ISignature {
    type: string
    data: string
}