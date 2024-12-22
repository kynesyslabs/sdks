// Base interface with common methods
interface IBaseTokenFinder<ChainId, Config> {
    findTokenPairs(
        tokenAddress: string,
        sourceChainId: ChainId,
        targetChainIds: ChainId[],
    ): Promise<Record<string, string | false>>
    findNativeToken(
        chainId: ChainId,
    ): Promise<{ native: string; wrapped: string }>
    isValidAddress(address: string): boolean
}

// EVM specific interface (exports this one directly)
export interface ITokenFinder<Config> extends IBaseTokenFinder<number, Config> {
    getRandomProvider(chainId: number): Promise<any>
}

// Non-EVM specific interface (separate export)
export interface INonEvmTokenFinder<ChainId, Config>
    extends IBaseTokenFinder<ChainId, Config> {
    validateChainId(chainId: ChainId): boolean
}
