import { readFileSync } from "fs"
import { join } from "path"
import { TLSN_ATTESTATION_MAX_AGE_SECONDS } from "@/tlsnotary/network"

/**
 * Nodes refuse a store or identity link whose attestation is older than the
 * genesis `freshnessWindowSec`, which is shorter than the 500-block token
 * lifetime at 10 s blocks. The SDK constant must stay equal to the mainnet
 * genesis value, or integrators plan around the wrong deadline.
 */
describe("TLSN_ATTESTATION_MAX_AGE_SECONDS", () => {
    it("is the mainnet genesis freshnessWindowSec", () => {
        expect(TLSN_ATTESTATION_MAX_AGE_SECONDS).toBe(3600)
    })

    it("is exported from the tlsnotary entry point", () => {
        // Read rather than imported: the entry point pulls in the tlsn-js
        // WASM bundle, which needs a browser to load.
        const entryPoint = readFileSync(
            join(__dirname, "..", "tlsnotary", "index.ts"),
            "utf8",
        )

        expect(entryPoint).toMatch(
            /export\s*\{[^}]*TLSN_ATTESTATION_MAX_AGE_SECONDS[^}]*\}\s*from\s*["']\.\/network["']/,
        )
    })
})
