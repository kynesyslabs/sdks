import { Demos } from "@/websdk"
import { TransportError } from "@/websdk/TransportError"
import { Web2Proxy } from "@/websdk/Web2Calls"
import { resolveNonce } from "@/utils"
import axios from "axios"

/**
 * The node returns the CONFIRMED nonce. Once its `nonceEnforcement` upgrade is
 * active it requires the exact next one — `confirmed + 1 + pending` (node
 * mempool admission). `getNextNonce`
 * expresses the no-pending case (`confirmed + 1`) once, so hand-derived nonces
 * stop landing on the off-by-one.
 */
function demosReporting(nonceValue: unknown) {
    const demos = new Demos()
    jest.spyOn(demos, "nodeCall").mockResolvedValue(nonceValue as any)
    return demos
}

const ADDRESS = "0x" + "ab".repeat(32)

describe("getNextNonce", () => {
    it("is one past the confirmed nonce", async () => {
        const demos = demosReporting(5)

        await expect(demos.getAddressNonce(ADDRESS)).resolves.toBe(5)
        await expect(demos.getNextNonce(ADDRESS)).resolves.toBe(6)
    })

    it("handles the string shape the node sometimes returns", async () => {
        const demos = demosReporting("5")

        await expect(demos.getNextNonce(ADDRESS)).resolves.toBe(6)
    })

    it("starts a fresh account at 1", async () => {
        const demos = demosReporting(0)

        await expect(demos.getAddressNonce(ADDRESS)).resolves.toBe(0)
        await expect(demos.getNextNonce(ADDRESS)).resolves.toBe(1)
    })

    it.each([null, undefined, {}, { result: 500 }])(
        "rejects a missing nonce reply (%p)",
        async reply => {
            const demos = demosReporting(reply)

            await expect(demos.getAddressNonce(ADDRESS)).rejects.toThrow(
                /no valid nonce/,
            )
            await expect(demos.getNextNonce(ADDRESS)).rejects.toThrow(
                /no valid nonce/,
            )
        },
    )

    it("limits unexpected reply text in errors", async () => {
        for (const reply of ["x".repeat(1000), { response: new Error("x".repeat(1000)) }]) {
            const demos = demosReporting(reply)
            let error: unknown
            try {
                await demos.getAddressNonce(ADDRESS)
            } catch (caught) {
                error = caught
            }
            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message.length).toBeLessThan(400)
        }
    })

    it("marks a truncated string reply with an ellipsis", async () => {
        const error = (await demosReporting("x".repeat(1000))
            .getAddressNonce(ADDRESS)
            .catch(error => error)) as Error

        expect(error.message).toMatch(/: x{200}…$/)
    })

    it("removes control characters from a string reply in the error", async () => {
        const error = (await demosReporting("\u001b[2K\rOK nonce=999\nfake")
            .getAddressNonce(ADDRESS)
            .catch(error => error)) as Error

        expect(error.message).toContain("?[2K?OK nonce=999?fake")
        expect(error.message).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/)
    })

    it("removes Unicode line separators and bidi marks from a string reply", async () => {
        const error = (await demosReporting("a\u2028FAKE LINE\u202eevil\u061cend")
            .getAddressNonce(ADDRESS)
            .catch(error => error)) as Error

        expect(error.message).toContain("a?FAKE LINE?evil?end")
        expect(error.message).not.toMatch(/[\u2028\u202e\u061c]/)
    })

    it("limits and sanitizes the address in the error", async () => {
        // The bridge passes an RPC-compiled demoAddress here.
        const address = "\u001b[2J\u001b[H" + "A".repeat(5000)
        const error = (await demosReporting("Error in nodeCall: ")
            .getAddressNonce(address)
            .catch(error => error)) as Error

        expect(error.message).toContain("for ?[2J?[H" + "A".repeat(193) + "…: ")
        expect(error.message.length).toBeLessThan(400)
        expect(error.message).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/)
    })

    it("shows a normal address unchanged in the error", async () => {
        const error = (await demosReporting("Error in nodeCall: ")
            .getAddressNonce(ADDRESS)
            .catch(error => error)) as Error

        expect(ADDRESS).toHaveLength(66)
        expect(error.message).toBe(
            `getAddressNonce: node returned no valid nonce for ${ADDRESS}: Error in nodeCall: `,
        )
    })

    it("reports the HTTP status before the generic Axios code", async () => {
        const failure = new TransportError("HTTP request failed", {
            cause: { code: "ERR_BAD_RESPONSE", response: { status: 503 } },
            attempts: 5,
        })
        const error = (await demosReporting({ result: 500, response: failure })
            .getAddressNonce(ADDRESS)
            .catch(error => error)) as Error

        expect(error.message).toContain("transport failure after 5 attempt(s): 503")
        expect(error.message).not.toContain("ERR_BAD_RESPONSE")
    })

    it("does not serialize a malformed object reply", async () => {
        let serializationAttempts = 0
        const reply = {
            payload: "x".repeat(1024),
            toJSON() {
                serializationAttempts++
                return this.payload
            },
        }

        await expect(demosReporting(reply).getAddressNonce(ADDRESS)).rejects.toThrow(
            /no valid nonce.*\[object\]/,
        )
        expect(serializationAttempts).toBe(0)
    })

    it("throws on the transport-error envelope instead of reporting 0", async () => {
        const demos = demosReporting({
            result: 500,
            response: new Error("connect ECONNREFUSED"),
            require_reply: false,
            extra: null,
        })

        await expect(demos.getAddressNonce(ADDRESS)).rejects.toThrow(
            /ECONNREFUSED/,
        )
        await expect(demos.getNextNonce(ADDRESS)).rejects.toThrow(
            /no valid nonce/,
        )
    })

    it("reports a connection refusal without exposing a long RPC URL", async () => {
        const demos = new Demos()
        const rpcPath = "x".repeat(300)
        const rpcUrl = `http://user:s3cret@example.test/${rpcPath}`
        Object.assign(demos, { rpc_url: rpcUrl })
        const post = jest.spyOn(axios, "post").mockRejectedValue(
            Object.assign(new Error("connect ECONNREFUSED"), {
                code: "ECONNREFUSED",
            }),
        )

        try {
            const error = await demos.getAddressNonce(ADDRESS).catch(error => error)
            expect(error.message).toMatch(/no valid nonce.*ECONNREFUSED/)
            expect(error.message).not.toContain("s3cret")
            expect(error.message).not.toContain(rpcPath.slice(-20))
            expect(post).toHaveBeenCalledWith(
                rpcUrl,
                expect.anything(),
                expect.anything(),
            )
        } finally {
            post.mockRestore()
        }
    })

    it.each([["abc"], [""], ["5abc"], ["-1"], [-1], [1.5], [NaN], [{}], [true]])(
        "throws on a non-nonce reply (%p)",
        async reply => {
            const demos = demosReporting(reply)

            await expect(demos.getAddressNonce(ADDRESS)).rejects.toThrow(
                /no valid nonce/,
            )
        },
    )

    it("resolveNonce rejects when the nonce lookup fails", async () => {
        const demos = demosReporting({ result: 500, response: "boom" })

        await expect(
            resolveNonce(undefined, () => demos.getAddressNonce(ADDRESS)),
        ).rejects.toThrow(/no valid nonce/)
    })

    it("asks the node for the address it was given", async () => {
        const demos = demosReporting(2)

        await demos.getNextNonce(ADDRESS)

        expect(demos.nodeCall).toHaveBeenCalledWith("getAddressNonce", {
            address: ADDRESS,
        })
    })
})

/**
 * #118 — nonce lag after a web2/DAHR request. A DAHR/web2 request consumes a
 * nonce exactly like a transfer, but `getAddressNonce` only advances on
 * inclusion, so a hand-derived `getNextNonce` returns a value that collides
 * with the still-pending DAHR tx. The documented fix is to wait for the nonce
 * to advance ({@link waitForNonce}) before deriving the next one.
 */
/**
 * A Demos wired to a node whose confirmed nonce for ADDRESS is `confirmed`
 * and which answers a DAHR request; records every transaction it signs.
 */
function demosRunningDahr(confirmed: number) {
    const demos = new Demos()
    const signed: any[] = []
    jest.spyOn(demos, "nodeCall").mockResolvedValue(confirmed as any)
    jest.spyOn(demos, "getEd25519Address").mockResolvedValue(ADDRESS)
    jest.spyOn(demos, "call").mockResolvedValue({
        result: 200,
        response: {
            status: 200,
            statusText: "OK",
            headers: {},
            responseHash: "0x01",
            responseHeadersHash: "0x02",
        },
    } as any)
    jest.spyOn(demos, "sign").mockImplementation(async (tx: any) => {
        signed.push(tx)
        return tx
    })
    jest.spyOn(demos, "confirm").mockResolvedValue({
        response: { data: { transaction: { hash: "0xdahr" } } },
    } as any)
    jest.spyOn(demos, "broadcast").mockResolvedValue({} as any)
    return { demos, signed }
}

describe("nonce lag after a web2/DAHR request (#118)", () => {
    const request = { method: "GET", url: "https://example.com" } as any

    it("a DAHR request signs confirmed + 1, and getNextNonce repeats it until inclusion", async () => {
        const { demos, signed } = demosRunningDahr(5)

        await new Web2Proxy("session", demos).startProxy(request)

        expect(signed).toHaveLength(1)
        expect(signed[0].content.type).toBe("web2Request")
        expect(signed[0].content.nonce).toBe(6)
        // The DAHR tx holds nonce 6 but the chain still reports 5, so a
        // hand-derived next send would reuse the in-flight nonce.
        await expect(demos.getNextNonce(ADDRESS)).resolves.toBe(6)
    })

    it("with auto-nonce, a send after a DAHR request takes the next nonce", async () => {
        const { demos, signed } = demosRunningDahr(5)
        demos.enableAutoNonce()

        await new Web2Proxy("session", demos).startProxy(request)
        await new Web2Proxy("session", demos).startProxy(request)

        expect(signed.map(tx => tx.content.nonce)).toEqual([6, 7])
    })

    it("waitForNonce rides out the lag until the DAHR tx is included", async () => {
        // Confirmed nonce stays at 5 while the DAHR tx (nonce 6) is pending,
        // then advances to 6 once the node includes it.
        const demos = new Demos()
        const observed = [5, 5, 6]
        jest.spyOn(demos, "nodeCall").mockImplementation(
            async () => (observed.length > 1 ? observed.shift() : observed[0]) as any,
        )

        await expect(
            demos.waitForNonce(ADDRESS, 6, { timeoutMs: 1000, pollIntervalMs: 1 }),
        ).resolves.toBeGreaterThanOrEqual(6)
    })
})
