export function requireFundedMnemonic(env: NodeJS.ProcessEnv): string {
    const mnemonic = env.FUNDED_MNEMONIC
    if (!mnemonic) {
        throw new Error("FUNDED_MNEMONIC is not set")
    }
    return mnemonic
}
