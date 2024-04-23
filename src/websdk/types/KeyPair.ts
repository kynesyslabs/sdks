export interface IKeyPair {
    privateKey: Buffer | Uint8Array | null | false
    publicKey: Buffer | Uint8Array | null | false
}

export interface IStringifiedKeyPair {
    privateKey: string
    publicKey: string
}