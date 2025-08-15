import { SigningAlgorithm } from "../cryptography"

export interface ISignature {
    type: SigningAlgorithm
    data: string
}