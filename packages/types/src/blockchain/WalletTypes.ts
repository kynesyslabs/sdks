import * as forge from "node-forge"

export type Address = `0x${string}`
export type Key = forge.pki.ed25519.BinaryBuffer | Address
