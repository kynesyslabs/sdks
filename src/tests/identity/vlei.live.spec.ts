/**
 * Live anchor/resolve round-trip against a running Demos node. Opt-in: skips
 * unless DEMOS_LIVE_RPC and a funded wallet (DEMOS_LIVE_MNEMONIC, or a path in
 * DEMOS_LIVE_MNEMONIC_FILE) are set. The wallet must hold a small fee balance —
 * a `storageProgram` deploy costs a couple of units.
 *
 *   DEMOS_LIVE_RPC=https://dev.node2.demos.sh:53650 \
 *   DEMOS_LIVE_MNEMONIC_FILE=./stress-test-mnemonic \
 *   npx jest src/tests/identity/vlei.live.spec.ts
 */
import { readFileSync } from "node:fs"
import { Demos } from "@/websdk"
import { demosClaimRefForAddress } from "@/identity/cci"
import {
    AGENT_AUTHORITY_SCHEMA,
    VLEI_SCHEMAS,
    verifyChain,
    txDigest,
    buildAttestation,
    signAttestation,
    verifyAttestation,
    anchorAttestation,
    resolveAttestation,
    type VleiCredential,
    type VleiCredentialSource,
    type VleiKeyState,
} from "@/identity/vlei"

const LIVE_RPC = process.env.DEMOS_LIVE_RPC
const LIVE_MNEMONIC =
    process.env.DEMOS_LIVE_MNEMONIC ??
    (process.env.DEMOS_LIVE_MNEMONIC_FILE ? readFileSync(process.env.DEMOS_LIVE_MNEMONIC_FILE, "utf8").trim() : undefined)

// Synthetic-but-valid agent-authority chain (mirrors vlei.spec.ts fixtures).
const aid = (c: string) => `E${c.repeat(43)}`
const GLEIF_ROOT = aid("G"), QVI_AID = aid("Q"), LE_AID = aid("L"), AGENT_AID = aid("A"), OFFICER_AID = aid("O")
const LE_LEI = "875500ELOZEL05BVXV37", QVI_LEI = "254900OPPU84GM83MG36"
const QVI_SAID = "EqviSaid", LE_SAID = "EleSaid", AA_SAID = "EaaSaid"
const IN_SCOPE_TX = { type: "treasury-payment", corridor: "EUR-USD", amount: "250000", currency: "USD", network: "demos-testnet" }
const AUTHORITY_SCOPE = { transactionTypes: ["treasury-payment"], corridors: ["EUR-USD"], perTransactionLimit: { amount: "1000000", currency: "USD" }, relyingNetworks: ["demos-testnet"] }
const creds: Record<string, VleiCredential> = {
    [QVI_SAID]: { sad: { d: QVI_SAID, s: VLEI_SCHEMAS.QVI, i: GLEIF_ROOT, a: { i: QVI_AID, LEI: QVI_LEI } }, status: { s: "0" } },
    [LE_SAID]: { sad: { d: LE_SAID, s: VLEI_SCHEMAS.LE, i: QVI_AID, a: { i: LE_AID, LEI: LE_LEI }, e: { qvi: { n: QVI_SAID } } }, status: { s: "0" } },
    [AA_SAID]: { sad: { d: AA_SAID, s: AGENT_AUTHORITY_SCHEMA, i: LE_AID, a: { i: AGENT_AID, authorityScope: AUTHORITY_SCOPE, accountableOfficer: OFFICER_AID }, e: { le: { n: LE_SAID } } }, status: { s: "0" } },
}
const KEY_STATES: Record<string, VleiKeyState> = { [GLEIF_ROOT]: { d: "ksG" }, [QVI_AID]: { d: "ksQVI" }, [LE_AID]: { d: "ksLE" }, [AGENT_AID]: { d: "ksA", di: LE_AID } }
const source: VleiCredentialSource = {
    async getCredential(said) { const c = creds[said]; if (!c) throw new Error(`unresolvable ${said}`); return c },
    async getKeyState(a) { return KEY_STATES[a] },
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const maybe = LIVE_RPC && LIVE_MNEMONIC ? describe : describe.skip

maybe("vLEI live anchor/resolve round-trip (opt-in)", () => {
    let demos: Demos

    beforeAll(async () => {
        demos = new Demos()
        await demos.connect(LIVE_RPC!)
        await demos.connectWallet(LIVE_MNEMONIC!)
    }, 60_000)

    it("anchors a signed attestation and resolves it back byte-for-byte", async () => {
        const attesterClaim = demosClaimRefForAddress(await demos.getEd25519Address())
        const verdict = await verifyChain(source, AA_SAID, GLEIF_ROOT, {
            proposedTx: IN_SCOPE_TX,
            keyControl: { agentAid: AGENT_AID, ok: true, challengeDigest: "ch".repeat(16), boundTxDigest: txDigest(IN_SCOPE_TX) },
            timestamp: "2026-01-01T00:00:00.000Z",
        })
        expect(verdict.ok).toBe(true)

        const att = await signAttestation(buildAttestation(verdict, attesterClaim, { boundAt: Date.now() }), demos)
        expect(verifyAttestation(att)).toBe(true)

        const anchor = await anchorAttestation(att, demos)
        expect(anchor.storageAddress).toBeTruthy()
        expect(anchor.txHash).toBeTruthy()

        // Poll until the storageProgram tx is included and the SP is queryable.
        let resolved: Awaited<ReturnType<typeof resolveAttestation>> = null
        const deadline = Date.now() + 120_000
        while (Date.now() < deadline) {
            resolved = await resolveAttestation(att.subjectClaim, att.recordDigest, LIVE_RPC!)
            if (resolved) break
            await sleep(2000)
        }

        expect(resolved).not.toBeNull()
        expect(resolved!.recordDigest).toBe(att.recordDigest)
        expect(resolved!.signature).toBe(att.signature)
        expect(resolved!.subjectClaim).toBe(att.subjectClaim)
        expect(verifyAttestation(resolved!)).toBe(true)
    }, 150_000)
})
