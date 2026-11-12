const warnedPaths = new Set<string>()

/** Shared by legacy wrappers so each derivation warns once per loaded SDK. */
export function warnLegacySeedPath(path: "bytes" | "legacy") {
    if (warnedPaths.has(path)) return
    warnedPaths.add(path)

    const api = path === "bytes"
        ? "connectWallet(Uint8Array)"
        : "DemosWebAuth.keyPairFromMnemonic, DemosWebAuth.create(seed), and Cryptography.newFromSeed"
    const derivation = path === "bytes"
        ? "64-byte inputs (BIP39 seed bytes or ed25519 secret keys) derive a different address from connectWallet(mnemonic). "
        : "This derives a different address from connectWallet(mnemonic). "
    console.warn(
        `[demosdk] ${api} is deprecated for mnemonic restoration: ${derivation}` +
        "Use the mnemonic string with connectWallet for new wallets. Existing wallets must keep their original derivation; switching changes the address.",
    )
}
