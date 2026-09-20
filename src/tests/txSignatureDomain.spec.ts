import { Demos, DemosTransactions } from "@/websdk"
import { DemosWebAuth } from "@/websdk/DemosWebAuth"
import type { SigningAlgorithm } from "@/types"
import {
    txSignaturePreimage,
    TX_SIGNATURE_DOMAIN,
} from "@/websdk/utils/txSignaturePreimage"
import { Cryptography } from "@/encryption"
import { hexToUint8Array } from "@/encryption/unifiedCrypto"

const HASH = "7c".repeat(32)

/**
 * A Demos instance whose only contact with a node is the cached
 * `getNetworkInfo` call the signer consults.
 */
function demosSeeing(networkInfo: unknown) {
    const demos = new Demos()
    jest.spyOn(demos, "getNetworkInfo").mockResolvedValue(
        networkInfo as never,
    )
    return demos
}

const PRE_FORK = { forks: { osDenomination: { activated: true } } }
const POST_FORK = {
    forks: {
        osDenomination: { activated: true },
        signatureDomain: { activated: true },
    },
    chainId: 1,
}

describe("txSignaturePreimage", () => {
    it("is the bare hash while the fork is inactive", () => {
        expect(
            new TextDecoder().decode(txSignaturePreimage(HASH, 1, false)),
        ).toBe(HASH)
    })

    it("names the domain and the chain once active", () => {
        expect(
            new TextDecoder().decode(txSignaturePreimage(HASH, 1, true)),
        ).toBe(`${TX_SIGNATURE_DOMAIN}1:${HASH}`)
    })

    it("separates chains", () => {
        expect(txSignaturePreimage(HASH, 1, true)).not.toEqual(
            txSignaturePreimage(HASH, 2, true),
        )
    })
})

describe("what the signer commits to", () => {
    async function signedBytesFor(networkInfo: unknown) {
        const demos = demosSeeing(networkInfo)
        await demos.connectWallet(
            "test test test test test test test test test test test junk",
            { algorithm: "ed25519" },
        )
        const seen: Uint8Array[] = []
        const realSign = demos.crypto.sign.bind(demos.crypto)
        jest.spyOn(demos.crypto, "sign").mockImplementation(
            async (algorithm: SigningAlgorithm, data: Uint8Array) => {
                seen.push(data)
                return realSign(algorithm, data)
            },
        )
        const tx = await demos.pay("0x" + "ab".repeat(32), 1_000_000_000n)
        return { hash: tx.hash, seen }
    }

    it("signs the bare hash against a node without the fork", async () => {
        const { hash, seen } = await signedBytesFor(PRE_FORK)

        expect(new TextDecoder().decode(seen[0])).toBe(hash)
    })

    it("signs the domain-bound preimage against a forked node", async () => {
        const { hash, seen } = await signedBytesFor(POST_FORK)

        expect(new TextDecoder().decode(seen[0])).toBe(
            `${TX_SIGNATURE_DOMAIN}1:${hash}`,
        )
    })

    it("keeps signing legacy bytes when the node cannot be reached", async () => {
        // getNetworkInfo returning null is the unreachable/pre-fork node
        // case: signing the new preimage there would produce transactions the
        // node rejects, so the fallback has to be the legacy shape.
        const { hash, seen } = await signedBytesFor(null)

        expect(new TextDecoder().decode(seen[0])).toBe(hash)
    })
})

describe("the deprecated standalone signer", () => {
    /**
     * It has no `Demos` instance, so it cannot ask a node anything. Left as
     * it was, it signed the bare hash unconditionally — meaning a consumer
     * still on this reachable, exported API produced signatures that an
     * activated node rejects, with no way to opt in.
     */
    async function signWith(options: {
        algorithm: "ed25519"
        chainId?: number
    }) {
        // Built through the real transaction path, then handed to the
        // standalone signer — the same sequence a consumer on the deprecated
        // API follows.
        const demos = demosSeeing(PRE_FORK)
        await demos.connectWallet(
            "test test test test test test test test test test test junk",
            { algorithm: "ed25519" },
        )
        const built = await demos.pay("0x" + "ab".repeat(32), 1_000_000_000n)

        return DemosTransactions.sign(
            built,
            {
                publicKey: hexToUint8Array(built.content.from as string),
                privateKey: (demos as never as { keypair: { privateKey: Uint8Array } })
                    .keypair.privateKey,
            } as never,
            options,
        )
    }

    it("still signs the legacy preimage by default", async () => {
        const tx = await signWith({ algorithm: "ed25519" })

        expect(
            Cryptography.verify(
                tx.hash,
                Buffer.from(hexToUint8Array(tx.signature.data)),
                Buffer.from(hexToUint8Array(tx.content.from as string)),
            ),
        ).toBe(true)
    })

    it("binds to a chain when given one", async () => {
        const tx = await signWith({ algorithm: "ed25519", chainId: 7 })

        expect(
            Cryptography.verify(
                `${TX_SIGNATURE_DOMAIN}7:${tx.hash}`,
                Buffer.from(hexToUint8Array(tx.signature.data)),
                Buffer.from(hexToUint8Array(tx.content.from as string)),
            ),
        ).toBe(true)
        expect(
            Cryptography.verify(
                tx.hash,
                Buffer.from(hexToUint8Array(tx.signature.data)),
                Buffer.from(hexToUint8Array(tx.content.from as string)),
            ),
        ).toBe(false)
    })
})
