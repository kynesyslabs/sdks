/**
 * Send native DEM from the FUNDED_MNEMONIC wallet to a recipient on a node.
 *
 * Usage:
 *   FUNDED_MNEMONIC="word1 ... word12" bun scripts/send-dem.ts
 *
 * Optional env overrides:
 *   RPC_URL   (default http://localhost:53550)
 *   TO        (default 0x77e5...d8c0)
 *   AMOUNT    DEM amount as a decimal string (default "2400")
 */
// Import the compiled build, not raw src: src/types/index.ts re-exports
// interfaces without the `type` keyword, which tsc elides but bun's
// per-file transpiler turns into failing runtime re-exports.
// Run `bun run build` first if build/ is missing or stale.
import { websdk, denomination } from "../build/index.js"

const { Demos } = websdk

const RPC_URL = process.env.RPC_URL ?? "http://localhost:53550"
const TO =
    process.env.TO ??
    "0x77e5cff4c6b49286d2a4c711c0e2a3678cc1ffd9c5f47438116625a582c4d8c0"
const AMOUNT_DEM = process.env.AMOUNT ?? "2400"

async function main() {
    const mnemonic = process.env.FUNDED_MNEMONIC
    if (!mnemonic) {
        throw new Error("FUNDED_MNEMONIC env var is not set")
    }

    const demos = new Demos()
    await demos.connect(RPC_URL)
    await demos.connectWallet(mnemonic)
    const from = demos.getAddress()

    // Convert DEM -> OS (1 DEM = 10^9 OS); the SDK signs in OS.
    const amountOs = denomination.demToOs(AMOUNT_DEM)

    const before = await demos.getAddressInfo(from)
    const beforeDem = before ? denomination.osToDem(before.balance) : "0"
    console.log(`node:     ${RPC_URL}`)
    console.log(`from:     ${from}`)
    console.log(`to:       ${TO}`)
    console.log(`amount:   ${AMOUNT_DEM} DEM (${amountOs} OS)`)
    console.log(`balance:  ${beforeDem} DEM`)

    if (!before || before.balance < amountOs) {
        throw new Error(
            `insufficient balance: have ${beforeDem} DEM, need ${AMOUNT_DEM} DEM plus gas`,
        )
    }

    // Signs, broadcasts, and polls getTransactionStatus until included/failed.
    const result = await demos.transferAndWait(TO, amountOs, {
        timeoutMs: 120_000,
    })

    console.log(`tx hash:  ${result.hash}`)
    console.log(`status:   ${JSON.stringify(result.status)}`)

    const after = await demos.getAddressInfo(from)
    const afterDem = after ? denomination.osToDem(after.balance) : "0"
    console.log(`balance:  ${afterDem} DEM (after)`)

    if (result.status.state !== "included") {
        process.exitCode = 1
    }
}

main().catch(err => {
    console.error("send-dem failed:", err?.message ?? err)
    process.exit(1)
})
