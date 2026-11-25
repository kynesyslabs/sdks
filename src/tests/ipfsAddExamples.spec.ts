import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runInNewContext } from "node:vm"
import * as ipfs from "../ipfs"

// Exercise the documented add calls, not the pin/unpin placeholders or a client.
const docs = readFileSync(join(__dirname, "../ipfs/IPFSOperations.ts"), "utf8")
    .replace(/^\s*\* ?/gm, "")
const calls = [...docs.matchAll(/const addPayload = (ipfs\.IPFSOperations\.createAddPayload\([\s\S]*?\n\))/g)]

describe("introductory IPFS add examples", () => {
    test.each(["hello.txt", "myfile.txt"].map((name, i) => [name, calls[i]?.[1]]))(
        "preserves %s in the payload",
        (name, call) => {
            expect(call).toBeDefined()
            expect(runInNewContext(call, { ipfs, Buffer }).filename).toBe(name)
        },
    )
})
