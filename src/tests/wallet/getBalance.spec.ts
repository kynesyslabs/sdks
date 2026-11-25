jest.mock("@/websdk", () => ({ demos: { getAddressInfo: jest.fn() } }))
jest.mock("@/encryption/Cryptography", () => ({ Cryptography: {} }))
jest.mock("@/wallet/passkeys/passkeys", () => ({ PasskeyGenerator: class {} }))

const { demos } = require("@/websdk")
const { default: Wallet } = require("@/wallet/Wallet") as typeof import("@/wallet/Wallet")

// Only the public key is needed for this read; don't create or load a wallet.
const ed25519_hex = { publicKey: "test-address" }
const getBalance = () => Wallet.prototype.getBalance.call({ ed25519_hex })

describe("Wallet.getBalance", () => {
    test.each([42n, 0n, null])("returns %s from the address lookup", async balance => {
        demos.getAddressInfo.mockResolvedValueOnce(balance === null ? null : { balance })
        expect(await getBalance()).toBe(balance)
        expect(demos.getAddressInfo).toHaveBeenLastCalledWith(ed25519_hex.publicKey)
    })

    test("propagates the lookup error", async () => {
        const error = new Error("lookup failed")
        demos.getAddressInfo.mockRejectedValueOnce(error)
        await expect(getBalance()).rejects.toBe(error)
    })
})

export {}
