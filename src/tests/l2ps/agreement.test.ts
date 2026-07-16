import { Demos, DemosWebAuth } from "@/websdk"
import { demosClaimRefForAddress, type ClaimReference } from "@/identity/cci"
import {
    AGREEMENT_DOMAIN_PREFIX,
    agreementHash,
    agreementHashHex,
    buildUnsignedAgreement,
    coSignAgreement,
    signAgreement,
    stripAgreementSignatures,
    verifyAgreement,
    type AgreementDocument,
} from "@/l2ps/agreement"

const CHANNEL = "ch-agreement-1"
const TERMS = { price: 100, currency: "USDC", item: "GPU-hour x40" }

async function newConnectedDemos(): Promise<{ demos: Demos; claim: ClaimReference }> {
    const auth = new DemosWebAuth()
    await auth.create()
    const demos = new Demos()
    await demos.connectWallet(auth.keypair.privateKey as Uint8Array)
    return {
        demos,
        claim: demosClaimRefForAddress(await demos.getEd25519Address()),
    }
}

/** A real three-party co-signed agreement — real keys, real signatures. */
async function committed() {
    const buyer = await newConnectedDemos()
    const seller = await newConnectedDemos()
    const financier = await newConnectedDemos()
    const parties = [buyer.claim, seller.claim, financier.claim]
    const doc = await coSignAgreement({
        channelId: CHANNEL,
        parties,
        body: TERMS,
        signers: [
            { claim: buyer.claim, demos: buyer.demos },
            { claim: seller.claim, demos: seller.demos },
            { claim: financier.claim, demos: financier.demos },
        ],
    })
    return { buyer, seller, financier, parties, doc }
}

describe("WI-D AgreementDocument — commit", () => {
    it("co-signed by every party verifies, and its hash comes from the bytes", async () => {
        const { doc, parties } = await committed()

        expect(verifyAgreement(doc)).toEqual({ ok: true, errors: [] })
        expect(doc.signatures).toHaveLength(3)
        expect(doc.signatures.map((s) => s.signer).sort()).toEqual([...parties].sort())
        // The anchorable identity is recomputed, never carried alongside.
        expect(agreementHash(doc)).toBe(agreementHashHex(stripAgreementSignatures(doc)))
        expect(agreementHash(doc)).toMatch(/^[0-9a-f]{64}$/)
    })

    it("is domain-separated under dacs-agreement:v1:", () => {
        expect(AGREEMENT_DOMAIN_PREFIX).toBe("dacs-agreement:v1:")
    })
})

describe("WI-D AgreementDocument — what it refuses", () => {
    it("refuses a document a party never signed — that binds nobody", async () => {
        const { doc, seller } = await committed()
        const partial: AgreementDocument = {
            ...doc,
            signatures: doc.signatures.filter((s) => s.signer !== seller.claim),
        }
        const r = verifyAgreement(partial)
        expect(r.ok).toBe(false)
        expect(r.errors.join(" ")).toMatch(/has not signed/)
    })

    it("refuses a body edited after signing", async () => {
        const { doc } = await committed()
        const tampered: AgreementDocument = { ...doc, body: { ...TERMS, price: 1 } }
        const r = verifyAgreement(tampered)
        expect(r.ok).toBe(false)
        expect(r.errors.join(" ")).toMatch(/failed verification/)
    })

    it("refuses a signature from a non-party", async () => {
        const { doc } = await committed()
        const outsider = await newConnectedDemos()
        const unsigned = stripAgreementSignatures(doc)
        // The outsider signs the real bytes — but it is not a party.
        const rogue = await signAgreement(
            { ...unsigned, parties: [...unsigned.parties, outsider.claim] },
            outsider.claim,
            outsider.demos,
        )
        const r = verifyAgreement({ ...doc, signatures: [...doc.signatures, rogue] })
        expect(r.ok).toBe(false)
        expect(r.errors.join(" ")).toMatch(/is not a party/)
    })

    it("refuses duplicate signatures from the same party", async () => {
        const { doc } = await committed()
        const r = verifyAgreement({ ...doc, signatures: [...doc.signatures, doc.signatures[0]] })
        expect(r.ok).toBe(false)
        expect(r.errors.join(" ")).toMatch(/duplicate signature/)
    })

    it("signAgreement refuses a signer who is not a party", async () => {
        const { parties } = await committed()
        const outsider = await newConnectedDemos()
        const unsigned = buildUnsignedAgreement({ channelId: CHANNEL, parties, body: TERMS })
        await expect(signAgreement(unsigned, outsider.claim, outsider.demos)).rejects.toThrow(
            /not a party/,
        )
    })
})

describe("WI-D AgreementDocument — the §0 invariant", () => {
    it("the committing parties must be exactly the channel's members", async () => {
        const { doc, parties } = await committed()
        // Same set → ok.
        expect(verifyAgreement(doc, { members: parties }).ok).toBe(true)

        // A member who never became a party — the agreement doesn't bind the session.
        const extra = await newConnectedDemos()
        const r1 = verifyAgreement(doc, { members: [...parties, extra.claim] })
        expect(r1.ok).toBe(false)
        expect(r1.errors.join(" ")).toMatch(/is not a party to the agreement/)

        // A party who was never in the channel — signed by someone who never negotiated.
        const r2 = verifyAgreement(doc, { members: parties.slice(0, 2) })
        expect(r2.ok).toBe(false)
        expect(r2.errors.join(" ")).toMatch(/not a member of the channel/)
    })
})
