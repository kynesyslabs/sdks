import { Demos } from "@/websdk/demosclass"
import { SubDemPrecisionError } from "@/denomination/networkInfo"

// REVIEW: P4 commit 4 — fork-detection + sub-DEM rejection + warn-once
// integration tests. We mock `Demos.nodeCall` to drive the cached
// fork status without standing up a node.

/**
 * Replace the `nodeCall` method on a `Demos` instance with a stubbed
 * implementation that returns whatever the test wants for the
 * `getNetworkInfo` message. Captures the number of times the stub
 * was hit so cache behaviour can be asserted.
 */
function stubNodeCall(demos: Demos, returnValue: unknown) {
    let callCount = 0
    ;(demos as any).nodeCall = async (message: string) => {
        if (message === "getNetworkInfo") {
            callCount += 1
            return returnValue
        }
        return null
    }
    return {
        get callCount() {
            return callCount
        },
    }
}

describe("Demos.getNetworkInfo — caching", () => {
    test("returns post-fork status from a healthy node", async () => {
        const demos = new Demos()
        stubNodeCall(demos, {
            forks: {
                osDenomination: {
                    activationHeight: 50,
                    activated: true,
                    currentHeight: 100,
                },
            },
        })

        const info = await demos.getNetworkInfo()
        expect(info).not.toBeNull()
        expect(info!.forks.osDenomination.activated).toBe(true)
    })

    test("caches the result for the instance's lifetime", async () => {
        const demos = new Demos()
        const stub = stubNodeCall(demos, {
            forks: {
                osDenomination: {
                    activationHeight: 50,
                    activated: true,
                    currentHeight: 100,
                },
            },
        })

        await demos.getNetworkInfo()
        await demos.getNetworkInfo()
        await demos.getNetworkInfo()

        expect(stub.callCount).toBe(1)
    })

    test("pre-fork status (activated=false) returns and caches", async () => {
        const demos = new Demos()
        const stub = stubNodeCall(demos, {
            forks: {
                osDenomination: {
                    activationHeight: null,
                    activated: false,
                    currentHeight: 10,
                },
            },
        })

        const info = await demos.getNetworkInfo()
        expect(info!.forks.osDenomination.activated).toBe(false)
        await demos.getNetworkInfo()
        expect(stub.callCount).toBe(1)
    })
})

describe("Demos.getNetworkInfo — failure fallback", () => {
    let warnSpy: jest.SpyInstance
    beforeEach(() => {
        warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    })
    afterEach(() => {
        warnSpy.mockRestore()
    })

    test("returns null and warns exactly once on RPC failure", async () => {
        const demos = new Demos()
        const stub = stubNodeCall(demos, null)

        const a = await demos.getNetworkInfo()
        const b = await demos.getNetworkInfo()
        const c = await demos.getNetworkInfo()

        expect(a).toBeNull()
        expect(b).toBeNull()
        expect(c).toBeNull()
        // The failure is cached too — no repeat hits to nodeCall.
        expect(stub.callCount).toBe(1)
        expect(warnSpy).toHaveBeenCalledTimes(1)
        const arg = warnSpy.mock.calls[0]![0] as string
        expect(arg).toContain("getNetworkInfo unavailable on target node")
        expect(arg).toContain("assuming pre-fork wire format")
        expect(arg).toContain("deprecated and will be removed in v4")
    })

    test("returns null and warns exactly once on malformed response", async () => {
        const demos = new Demos()
        // Missing `forks.osDenomination.activated` shape.
        stubNodeCall(demos, { forks: { other: {} } })

        await demos.getNetworkInfo()
        await demos.getNetworkInfo()

        expect(warnSpy).toHaveBeenCalledTimes(1)
    })

    test("warn fires exactly once even across many sign-equivalent calls", async () => {
        const demos = new Demos()
        stubNodeCall(demos, null)

        // Simulate the volume of getNetworkInfo calls implied by 100
        // sequential `sign()` invocations.
        for (let i = 0; i < 100; i++) {
            await demos.getNetworkInfo()
        }

        expect(warnSpy).toHaveBeenCalledTimes(1)
    })

    test("each new Demos instance gets its own warn budget", async () => {
        const a = new Demos()
        stubNodeCall(a, null)
        await a.getNetworkInfo()

        const b = new Demos()
        stubNodeCall(b, null)
        await b.getNetworkInfo()

        expect(warnSpy).toHaveBeenCalledTimes(2)
    })
})

describe("Demos sub-DEM precision guard", () => {
    test("post-fork node: sub-DEM amount is allowed", async () => {
        const demos = new Demos()
        stubNodeCall(demos, {
            forks: {
                osDenomination: {
                    activationHeight: 50,
                    activated: true,
                    currentHeight: 100,
                },
            },
        })

        // _assertAmountAcceptableOnTargetNode is private; reach through
        // the runtime since this is a whitebox unit test.
        await expect(
            (demos as any)._assertAmountAcceptableOnTargetNode(1_234_567_890n),
        ).resolves.toBeUndefined()
    })

    test("pre-fork node: whole-DEM amount is allowed", async () => {
        const demos = new Demos()
        stubNodeCall(demos, {
            forks: {
                osDenomination: {
                    activationHeight: null,
                    activated: false,
                    currentHeight: 10,
                },
            },
        })

        // 100 DEM = 100_000_000_000n OS — whole DEM, must pass.
        await expect(
            (demos as any)._assertAmountAcceptableOnTargetNode(
                100_000_000_000n,
            ),
        ).resolves.toBeUndefined()
    })

    test("pre-fork node: sub-DEM amount throws SubDemPrecisionError", async () => {
        const demos = new Demos()
        stubNodeCall(demos, {
            forks: {
                osDenomination: {
                    activationHeight: null,
                    activated: false,
                    currentHeight: 10,
                },
            },
        })

        const subDemAmount = 1_234_567_890n // not divisible by 1e9
        let caught: unknown = null
        try {
            await (demos as any)._assertAmountAcceptableOnTargetNode(
                subDemAmount,
            )
        } catch (e) {
            caught = e
        }
        expect(caught).toBeInstanceOf(SubDemPrecisionError)
        const err = caught as SubDemPrecisionError
        expect(err.amountOs).toBe(subDemAmount)
        expect(err.subDemRemainderOs).toBe(234_567_890n)
        expect(err.message).toContain("1234567890 OS")
        expect(err.message).toContain("234567890 OS")
    })

    test("RPC-failed node: treated as pre-fork, sub-DEM rejected", async () => {
        // Silence the warn for this test.
        const warnSpy = jest
            .spyOn(console, "warn")
            .mockImplementation(() => {})

        const demos = new Demos()
        stubNodeCall(demos, null)

        let caught: unknown = null
        try {
            await (demos as any)._assertAmountAcceptableOnTargetNode(1n)
        } catch (e) {
            caught = e
        }
        expect(caught).toBeInstanceOf(SubDemPrecisionError)

        warnSpy.mockRestore()
    })
})
