import * as forge from "node-forge"
import * as fs from "fs"
import { dataManipulation } from "@/utils"

export type Address = `0x[0-9a-fA-F]+`
export type Key = forge.pki.ed25519.BinaryBuffer | Address