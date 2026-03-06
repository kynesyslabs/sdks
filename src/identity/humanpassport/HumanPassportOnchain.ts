/**
 * Human Passport Onchain Verifier
 *
 * Provides methods to verify Human Passport scores directly from
 * the blockchain using the GitcoinPassportDecoder contracts.
 */

import { ethers } from 'ethers'
import {
    HumanPassportError,
    HumanPassportException
} from '@/abstraction/types/HumanPassportTypes'

/**
 * Decoder contract addresses on supported chains
 * Source: https://docs.passport.xyz/building-with-passport/smart-contracts/contract-reference
 */
const DECODER_ADDRESSES: Record<number, string> = {
    42161: '0x2050256A91cbABD7C42465aA0d5325115C1dEB43',  // Arbitrum One
    8453: '0xaa24a127d10C68C8F9Ac06199AA606953cD82eE7',   // Base
    59144: '0x423cd60ab053F1b63D6F78c8c0c63e20F009d669',  // Linea
    10: '0x5558D441779Eca04A329BcD6b47830D2C6607769',     // Optimism
    534352: '0x8A5820030188346cC9532a1dD9FD2EF8d8F464de', // Scroll
    324: '0x1166FCDCA3B04311Ba9E2eD5ad2c660E730e1386',    // ZkSync Era
}

/**
 * Chain names for display
 */
const CHAIN_NAMES: Record<number, string> = {
    42161: 'Arbitrum One',
    8453: 'Base',
    59144: 'Linea',
    10: 'Optimism',
    534352: 'Scroll',
    324: 'ZkSync Era'
}

/**
 * ABI for GitcoinPassportDecoder contract
 */
const DECODER_ABI = [
    'function getScore(address user) view returns (uint256)',
    'function isHuman(address user) view returns (bool)',
    'function getPassport(address user) view returns (tuple(string provider, uint256 score)[])'
]

/**
 * Raw stamp tuple from ABI (matches contract return type)
 */
type StampTuple = {
    provider: string
    score: bigint
} | [string, bigint]

/**
 * Type guard to check if error is an ethers error with message
 */
function isEthersError(error: unknown): error is { message: string; reason?: string } {
    return (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message: unknown }).message === 'string'
    )
}

/**
 * Stamp data from onchain passport
 */
export interface OnchainStamp {
    provider: string
    score: number
}

/**
 * Onchain score result
 */
export interface OnchainScoreResult {
    address: string
    score: number
    isHuman: boolean
    chainId: number
    chainName: string
    stamps: OnchainStamp[]
}

/**
 * Human Passport Onchain Verifier
 *
 * Verifies Human Passport scores directly from blockchain using
 * the GitcoinPassportDecoder smart contracts.
 *
 * @example
 * ```typescript
 * // Using ethers provider
 * const provider = new ethers.JsonRpcProvider('https://mainnet.base.org')
 * const verifier = new HumanPassportOnchain(provider, 8453) // Base
 *
 * const score = await verifier.getScore('0x...')
 * const isHuman = await verifier.isHuman('0x...')
 * ```
 */
export class HumanPassportOnchain {
    private provider: ethers.Provider
    private decoder: ethers.Contract
    private chainId: number

    /**
     * Create onchain verifier instance
     *
     * @param provider - ethers Provider instance
     * @param chainId - Chain ID (must be supported)
     * @throws HumanPassportException if chain not supported
     */
    constructor(provider: ethers.Provider, chainId: number) {
        const decoderAddress = DECODER_ADDRESSES[chainId]

        if (!decoderAddress) {
            throw new HumanPassportException(
                HumanPassportError.UNSUPPORTED_CHAIN,
                `Human Passport onchain verification not supported on chain ${chainId}. ` +
                `Supported chains: ${Object.keys(DECODER_ADDRESSES).join(', ')}`,
                { chainId, supportedChains: Object.keys(DECODER_ADDRESSES).map(Number) }
            )
        }

        this.provider = provider
        this.chainId = chainId
        this.decoder = new ethers.Contract(decoderAddress, DECODER_ABI, provider)
    }

    /**
     * Get list of supported chain IDs
     */
    static getSupportedChains(): number[] {
        return Object.keys(DECODER_ADDRESSES).map(Number)
    }

    /**
     * Check if a chain is supported
     */
    static isChainSupported(chainId: number): boolean {
        return chainId in DECODER_ADDRESSES
    }

    /**
     * Get chain name by ID
     */
    static getChainName(chainId: number): string | undefined {
        return CHAIN_NAMES[chainId]
    }

    /**
     * Get decoder contract address for a chain
     */
    static getDecoderAddress(chainId: number): string | undefined {
        return DECODER_ADDRESSES[chainId]
    }

    /**
     * Get user's humanity score from onchain
     *
     * @param address - Ethereum address to check
     * @returns Score (divide by 10000 for actual value)
     */
    async getScore(address: string): Promise<number> {
        if (!ethers.isAddress(address)) {
            throw new HumanPassportException(
                HumanPassportError.INVALID_ADDRESS,
                `Invalid Ethereum address format: ${address}`,
                { address, chainId: this.chainId }
            )
        }

        try {
            const rawScore = await this.decoder.getScore(address)
            // Score is returned as uint256, divide by 10000 per docs
            return Number(rawScore) / 10000
        } catch (error: unknown) {
            if (isEthersError(error)) {
                if (error.reason?.includes('revert') || error.message.includes('revert')) {
                    throw new HumanPassportException(
                        HumanPassportError.NO_PASSPORT,
                        'No passport score found onchain for this address',
                        { address, chainId: this.chainId }
                    )
                }
                throw new HumanPassportException(
                    HumanPassportError.API_UNAVAILABLE,
                    `Onchain verification failed: ${error.message}`,
                    { address, chainId: this.chainId, originalError: error.message }
                )
            }
            throw new HumanPassportException(
                HumanPassportError.API_UNAVAILABLE,
                'Onchain verification failed with unknown error',
                { address, chainId: this.chainId }
            )
        }
    }

    /**
     * Check if address is considered human (score >= 20)
     *
     * @param address - Ethereum address to check
     * @returns true if address passes humanity threshold
     */
    async isHuman(address: string): Promise<boolean> {
        if (!ethers.isAddress(address)) {
            throw new HumanPassportException(
                HumanPassportError.INVALID_ADDRESS,
                `Invalid Ethereum address format: ${address}`,
                { address, chainId: this.chainId }
            )
        }

        try {
            return await this.decoder.isHuman(address)
        } catch (error: unknown) {
            if (isEthersError(error)) {
                if (error.reason?.includes('revert') || error.message.includes('revert')) {
                    return false // No passport = not human
                }
                throw new HumanPassportException(
                    HumanPassportError.API_UNAVAILABLE,
                    `Onchain verification failed: ${error.message}`,
                    { address, chainId: this.chainId, originalError: error.message }
                )
            }
            return false // Unknown error = treat as not human
        }
    }

    /**
     * Get user's passport stamps from onchain
     *
     * @param address - Ethereum address to check
     * @returns Array of stamps with provider and score
     */
    async getPassport(address: string): Promise<OnchainStamp[]> {
        if (!ethers.isAddress(address)) {
            throw new HumanPassportException(
                HumanPassportError.INVALID_ADDRESS,
                `Invalid Ethereum address format: ${address}`,
                { address, chainId: this.chainId }
            )
        }

        try {
            const stamps: StampTuple[] = await this.decoder.getPassport(address)
            return stamps.map((s: StampTuple) => {
                // Handle both object and tuple formats
                if (Array.isArray(s)) {
                    return {
                        provider: s[0],
                        score: Number(s[1])
                    }
                }
                return {
                    provider: s.provider,
                    score: Number(s.score)
                }
            })
        } catch (error: unknown) {
            if (isEthersError(error)) {
                if (error.reason?.includes('revert') || error.message.includes('revert')) {
                    return [] // No passport = no stamps
                }
                throw new HumanPassportException(
                    HumanPassportError.API_UNAVAILABLE,
                    `Failed to get onchain passport: ${error.message}`,
                    { address, chainId: this.chainId, originalError: error.message }
                )
            }
            return [] // Unknown error = no stamps
        }
    }

    /**
     * Get complete onchain score result
     *
     * @param address - Ethereum address to check
     * @returns Complete score data including stamps
     */
    async getFullScore(address: string): Promise<OnchainScoreResult> {
        const [scoreResult, isHumanResult, stampsResult] = await Promise.allSettled([
            this.getScore(address),
            this.isHuman(address),
            this.getPassport(address)
        ])

        // Handle NO_PASSPORT error from getScore - return 0 instead of rejecting
        let score = 0
        if (scoreResult.status === 'fulfilled') {
            score = scoreResult.value
        } else if (scoreResult.reason instanceof HumanPassportException) {
            if (scoreResult.reason.code === HumanPassportError.NO_PASSPORT) {
                score = 0 // No passport = score 0
            } else {
                throw scoreResult.reason // Re-throw other errors
            }
        } else {
            throw scoreResult.reason // Re-throw non-HumanPassportException errors
        }

        // isHuman and getPassport already handle NO_PASSPORT gracefully (return false/[])
        const isHuman = isHumanResult.status === 'fulfilled' ? isHumanResult.value : false
        const stamps = stampsResult.status === 'fulfilled' ? stampsResult.value : []

        return {
            address: address.toLowerCase(),
            score,
            isHuman,
            chainId: this.chainId,
            chainName: CHAIN_NAMES[this.chainId] || `Chain ${this.chainId}`,
            stamps
        }
    }

    /**
     * Get the chain ID this verifier is configured for
     */
    getChainId(): number {
        return this.chainId
    }

    /**
     * Get the decoder contract address
     */
    getDecoderAddress(): string {
        return DECODER_ADDRESSES[this.chainId]
    }
}

export default HumanPassportOnchain
