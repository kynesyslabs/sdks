import * as forge from "node-forge"
import * as fs from "fs"
import { dataManipulation } from "@/utils"

export type Address = `0x${string}`
export type Key = forge.pki.ed25519.BinaryBuffer | Address
