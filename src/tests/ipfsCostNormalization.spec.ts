import { IPFSOperations, type IpfsQuoteResponse } from "@/ipfs/IPFSOperations"

// REVIEW: PR-86 review fix (myc#17) — _normalizeQuoteCostOs must
// canonicalise the cost_os branch the same way it canonicalises the
// cost_dem branch. A non-canonical value flowing into max_cost_os
// would diverge from the node's post-fork hash because the
// serializerGate does not re-walk nested data fields.

function quoteWith(over: Partial<IpfsQuoteResponse>): IpfsQuoteResponse {
    return {
        file_size_bytes: 1024,
        is_genesis: false,
        breakdown: {
            base_cost: "1000000000",
            size_cost: "0",
            free_tier_bytes: 0,
            chargeable_bytes: 1024,
        },
        operation: "IPFS_ADD",
        ...over,
    }
}

describe("IPFSOperations.quoteToCustomCharges canonical cost_os (myc#17)", () => {
    test("canonical cost_os is preserved", () => {
        const out = IPFSOperations.quoteToCustomCharges(
            quoteWith({ cost_os: "1000000000" }),
        )
        expect(out.maxCostOs).toBe("1000000000")
    })

    test("non-canonical cost_os with leading zeros is normalised", () => {
        const out = IPFSOperations.quoteToCustomCharges(
            quoteWith({ cost_os: "00100" }),
        )
        expect(out.maxCostOs).toBe("100")
    })

    test("non-canonical cost_os with surrounding whitespace is normalised", () => {
        const out = IPFSOperations.quoteToCustomCharges(
            quoteWith({ cost_os: " 12345 " }),
        )
        expect(out.maxCostOs).toBe("12345")
    })

    test("invalid cost_os (non-decimal) throws via parseOsString", () => {
        expect(() =>
            IPFSOperations.quoteToCustomCharges(
                quoteWith({ cost_os: "1.5e9" }),
            ),
        ).toThrow()
    })

    test("cost_dem branch still canonicalises (regression sanity)", () => {
        const out = IPFSOperations.quoteToCustomCharges(
            quoteWith({ cost_dem: "1" }),
        )
        // 1 DEM = 1_000_000_000 OS. demToOs("1") -> 1_000_000_000n -> "1000000000".
        expect(out.maxCostOs).toBe("1000000000")
    })
})

describe("IPFSOperations.createCustomCharges canonical cost_os (myc#17)", () => {
    test("non-canonical cost_os flows out canonical via createCustomCharges", () => {
        const charges = IPFSOperations.createCustomCharges(
            quoteWith({ cost_os: "00010000000000" }),
            "IPFS_ADD",
        )
        expect(charges.max_cost_os).toBe("10000000000")
    })
})
