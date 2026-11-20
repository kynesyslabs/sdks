import { createValidatorNamespace } from "@/websdk/programmatic/validator"
import type { ProgrammaticContext } from "@/websdk/programmatic/context"
import type { Demos } from "@/websdk/demosclass"

// The one-call wrappers must hand the builder everything a seat needs; the
// runner itself is covered by runner.spec.ts, so here it only invokes source.

function makeCtx() {
    const stake = jest.fn(async () => ({ hash: "0xstake" }))
    const challengeValidator = jest.fn(async () => ({ hash: "0xchallenge" }))
    const demos = { tx: { stake, challengeValidator } } as unknown as Demos
    const run = jest.fn(async (source: () => Promise<unknown>) => {
        await source()
        return { mode: "manual" } as never
    })
    const ctx = { demos, run } as unknown as ProgrammaticContext
    return { ctx, demos, stake, challengeValidator, run }
}

const nft = {
    mint: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    owner: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    proofTx: "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW",
}

describe("demos.run.validator", () => {
    it("forwards the NFT proof to the stake builder", async () => {
        const { ctx, demos, stake } = makeCtx()
        await createValidatorNamespace(ctx).stake("0", "https://v.example", { nft, nonce: 7 })
        expect(stake).toHaveBeenCalledWith("0", "https://v.example", demos, { nonce: 7, nft })
    })

    it("stakes DEM without an NFT when none is given", async () => {
        const { ctx, demos, stake } = makeCtx()
        await createValidatorNamespace(ctx).stake("1000", "https://v.example")
        expect(stake).toHaveBeenCalledWith("1000", "https://v.example", demos, {
            nonce: undefined,
            nft: undefined,
        })
    })

    it("challenges a seat in one call", async () => {
        const { ctx, demos, challengeValidator, run } = makeCtx()
        const opts = { confirm: "manual" as const }
        await createValidatorNamespace(ctx).challenge("0xabc", "evidence", "proof", opts)
        expect(challengeValidator).toHaveBeenCalledWith("0xabc", "evidence", "proof", demos, {
            nonce: undefined,
        })
        expect(run).toHaveBeenCalledWith(expect.any(Function), opts)
    })
})
