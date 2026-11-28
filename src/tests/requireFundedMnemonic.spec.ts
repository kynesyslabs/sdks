import { requireFundedMnemonic } from "./utils/requireFundedMnemonic"

describe("live test prerequisite", () => {
    it.each([{}, { FUNDED_MNEMONIC: "" }])("fails without exiting for %j", env => {
        // A regression must fail the assertion, not terminate the runner itself.
        const exit = jest.spyOn(process, "exit").mockImplementation(code => {
            throw new Error(`unexpected process.exit(${code})`)
        })
        try {
            expect(() => requireFundedMnemonic(env)).toThrow("FUNDED_MNEMONIC is not set")
            expect(exit).not.toHaveBeenCalled()
        } finally {
            exit.mockRestore()
        }
    })

    it("passes the configured value through unchanged", () => {
        expect(requireFundedMnemonic({ FUNDED_MNEMONIC: "fixture" })).toBe("fixture")
    })
})
