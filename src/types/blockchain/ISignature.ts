import { pki } from "node-forge"

export interface ISignature {
    type: string
    data: pki.ed25519.BinaryBuffer
}