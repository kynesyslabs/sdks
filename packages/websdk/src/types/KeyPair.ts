export interface IKeyPair {
    privateKey: Buffer | Uint8Array
    publicKey: Buffer | Uint8Array
}

export interface IStringifiedKeyPair {
    privateKey: string
    publicKey: string
}