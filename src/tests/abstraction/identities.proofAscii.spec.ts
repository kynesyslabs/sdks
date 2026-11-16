import { Identities } from "@/abstraction"
import { Demos } from "@/websdk"

function stubDemos() {
    const sign = jest.fn(async (tx: any) => tx)
    const confirm = jest.fn(async (tx: any) => tx)
    const demos = {
        crypto: {
            getIdentity: jest.fn(async () => ({ publicKey: new Uint8Array(32) })),
        },
        getAddressNonce: jest.fn(async () => 0),
        sign,
        confirm,
    } as unknown as Demos
    return { demos, sign, confirm }
}

describe("web2 proof URL encoding", () => {
    const identities = new Identities()

    test("rejects non-ASCII proof URLs before signing", async () => {
        const { demos, sign, confirm } = stubDemos()
        for (const proof of [
            "https://x.com/josé/status/1",
            "https://x.com/alice/status/1?memo=—",
        ]) {
            await expect(
                identities.inferWeb2Identity(demos, {
                    context: "twitter",
                    username: "alice",
                    userId: "1",
                    proof,
                }),
            ).rejects.toThrow(
                "web2 identity proof URLs must be ASCII; percent-encode non-ASCII path and query characters; use the punycode (xn--) form for hostnames",
            )
        }
        expect(sign).not.toHaveBeenCalled()
        expect(confirm).not.toHaveBeenCalled()
    })

    test("rejects a Unicode domain host and accepts its punycode form", async () => {
        const { demos, sign, confirm } = stubDemos()
        const unicodeProof = "https://münchen.de/.well-known/demos-cci.txt"
        const punycodeProof = "https://xn--mnchen-3ya.de/.well-known/demos-cci.txt"

        await expect(
            identities.inferWeb2Identity(demos, {
                context: "domain",
                username: "xn--mnchen-3ya.de",
                userId: "xn--mnchen-3ya.de",
                proof: unicodeProof,
            }),
        ).rejects.toThrow(
            "percent-encode non-ASCII path and query characters; use the punycode (xn--) form for hostnames",
        )
        expect(sign).not.toHaveBeenCalled()

        await identities.inferWeb2Identity(demos, {
            context: "domain",
            username: "xn--mnchen-3ya.de",
            userId: "xn--mnchen-3ya.de",
            proof: punycodeProof,
        })
        expect(sign).toHaveBeenCalledTimes(1)
        expect(confirm).toHaveBeenCalledTimes(1)
        expect(sign.mock.calls[0][0].content.data[1].payload.proof).toBe(punycodeProof)
    })

    test("ASCII and percent-encoded URLs pass through unchanged", async () => {
        const { demos, sign, confirm } = stubDemos()
        for (const proof of [
            "https://x.com/alice/status/1",
            "https://x.com/jos%C3%A9/status/1",
        ]) {
            await identities.inferWeb2Identity(demos, {
                context: "twitter",
                username: "alice",
                userId: "1",
                proof,
            })
        }
        expect(sign).toHaveBeenCalledTimes(2)
        expect(confirm).toHaveBeenCalledTimes(2)
        expect(sign.mock.calls.map(([tx]) => tx.content.data[1].payload.proof)).toEqual([
            "https://x.com/alice/status/1",
            "https://x.com/jos%C3%A9/status/1",
        ])
    })

    test("Telegram attestation payloads remain accepted", async () => {
        const { demos, sign, confirm } = stubDemos()
        const proof = { payload: { username: "josé", telegram_user_id: "1" } }
        await identities.inferWeb2Identity(demos, {
            context: "telegram",
            username: "josé",
            userId: "1",
            proof,
        } as any)
        expect(sign).toHaveBeenCalledTimes(1)
        expect(confirm).toHaveBeenCalledTimes(1)
        expect(sign.mock.calls[0][0].content.data[1].payload.proof).toBe(proof)
    })
})
