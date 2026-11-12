import { Demos } from "@/websdk"
import { Identities } from "@/abstraction"
import { GCRGeneration } from "@/websdk/GCRGeneration"
import type { HumanPassportClaim } from "@/types/abstraction"

/**
 * Nodes store the Human Passport score the assign carries instead of asking
 * the provider during apply, and refuse an assign without score and
 * threshold. The claim comes from the node's `getHumanPassportClaim` routine
 * and has to reach the transaction and the GCR edit unchanged.
 */
const CLAIM: HumanPassportClaim = {
    address: "0x" + "ab".repeat(20),
    verificationMethod: "api",
    score: 25.5,
    threshold: 20,
    stamps: ["Google", "Discord"],
    lastScoreTimestamp: "2026-11-01T10:00:00.000Z",
    expirationTimestamp: null,
}

async function signingDemos(): Promise<{ demos: Demos; signed: any[] }> {
    const demos = new Demos()
    ;(demos as any).nodeCall = async (message: string) =>
        message === "getAddressNonce" ? 3 : null
    await demos.connectWallet(demos.newMnemonic())

    const signed: any[] = []
    jest.spyOn(demos, "confirm").mockImplementation(async (tx: any) => {
        signed.push(tx)
        return tx
    })
    return { demos, signed }
}

describe("Human Passport claim", () => {
    const identities = new Identities()

    it("asks the node's getHumanPassportClaim routine and returns its claim", async () => {
        const demos = new Demos()
        const rpc = jest
            .spyOn(demos, "rpcCall")
            .mockResolvedValue({ result: 200, response: CLAIM, require_reply: false, extra: null })

        await expect(identities.getHumanPassportClaim(demos, CLAIM.address)).resolves.toEqual(CLAIM)
        expect(rpc).toHaveBeenCalledWith(
            {
                method: "gcr_routine",
                params: [{ method: "getHumanPassportClaim", params: [CLAIM.address] }],
            },
            true,
        )
    })

    it("throws the node's reason when there is no claim", async () => {
        const demos = new Demos()
        jest.spyOn(demos, "rpcCall").mockResolvedValue({
            result: 400,
            response: null,
            require_reply: false,
            extra: { error: "address is required" },
        })
        await expect(identities.getHumanPassportClaim(demos, "")).rejects.toThrow(
            "address is required",
        )
    })

    it("builds a payload of exactly the fields admission compares", () => {
        const withExtra = { ...CLAIM, passingScore: true, uiLabel: "x" } as HumanPassportClaim
        const payload = identities.createHumanPassportPayload(withExtra, { referralCode: "REF1" })
        expect(payload).toEqual({ ...CLAIM, referralCode: "REF1" })
        expect(Object.keys(payload).sort()).toEqual(
            [
                "address",
                "expirationTimestamp",
                "lastScoreTimestamp",
                "referralCode",
                "score",
                "stamps",
                "threshold",
                "verificationMethod",
            ].sort(),
        )
    })

    it("leaves out optional fields the claim does not have", () => {
        const { stamps, lastScoreTimestamp, expirationTimestamp, ...bare } = CLAIM
        expect(Object.keys(identities.createHumanPassportPayload(bare)).sort()).toEqual(
            ["address", "score", "threshold", "verificationMethod"],
        )
    })

    it("refuses a payload the node would refuse", async () => {
        const { demos, signed } = await signingDemos()
        await expect(
            identities.addHumanPassportIdentity(demos, {
                address: CLAIM.address,
                verificationMethod: "api",
            } as any),
        ).rejects.toThrow("getHumanPassportClaim")
        expect(() =>
            identities.createHumanPassportPayload({ ...CLAIM, score: 10 }),
        ).toThrow("below the threshold 20")
        expect(signed).toHaveLength(0)
    })

    it("signs the claim into the transaction and the GCR edit unchanged", async () => {
        const { demos, signed } = await signingDemos()
        const payload = identities.createHumanPassportPayload(CLAIM, { referralCode: "REF1" })
        await identities.addHumanPassportIdentity(demos, payload)

        const tx = signed[0]
        expect(tx.content.data[1].method).toBe("humanpassport_identity_assign")
        expect(tx.content.data[1].payload).toEqual(payload)

        const edits = await GCRGeneration.generate(tx)
        const edit = edits.find(e => e.type === "identity") as any
        expect(edit.data).toEqual(payload)
        expect(edit.referralCode).toBe("REF1")
    })
})
