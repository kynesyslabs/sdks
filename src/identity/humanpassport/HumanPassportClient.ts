/**
 * Human Passport API Client
 *
 * Provides methods to interact with the Human Passport Stamps API v2
 * for retrieving user scores and stamp data.
 */

import axios, { AxiosInstance } from 'axios'
import {
    HumanPassportConfig,
    HumanPassportScore,
    HumanPassportStamp,
    HumanPassportError,
    HumanPassportException
} from '@/abstraction/types/HumanPassportTypes'

/**
 * Raw API response from Human Passport
 */
interface RawScoreResponse {
    address: string
    score: string
    passing_score: boolean
    last_score_timestamp: string
    expiration_timestamp: string | null
    threshold: string
    error: string | null
    stamps: Record<string, any>
    points_data: any | null
    possible_points_data: any | null
}

/**
 * Human Passport API Client
 *
 * Singleton client for interacting with the Human Passport Stamps API.
 *
 * @example
 * ```typescript
 * // Initialize once
 * const client = HumanPassportClient.initialize({
 *     apiKey: 'your-api-key',
 *     scorerId: 'your-scorer-id'
 * })
 *
 * // Use anywhere
 * const score = await HumanPassportClient.getInstance().getScore('0x...')
 * const isHuman = await HumanPassportClient.getInstance().isHuman('0x...')
 * ```
 */
export class HumanPassportClient {
    private config: Required<HumanPassportConfig>
    private axiosInstance: AxiosInstance
    private static instance: HumanPassportClient | null = null

    private constructor(config: HumanPassportConfig) {
        this.config = {
            apiKey: config.apiKey,
            scorerId: config.scorerId,
            baseUrl: config.baseUrl || 'https://api.passport.xyz'
        }

        this.axiosInstance = axios.create({
            baseURL: this.config.baseUrl,
            timeout: 30000,
            headers: {
                'X-API-KEY': this.config.apiKey,
                'Content-Type': 'application/json'
            }
        })
    }

    /**
     * Initialize the Human Passport client (call once at startup)
     */
    static initialize(config: HumanPassportConfig): HumanPassportClient {
        HumanPassportClient.instance = new HumanPassportClient(config)
        return HumanPassportClient.instance
    }

    /**
     * Get the singleton instance
     * @throws Error if not initialized
     */
    static getInstance(): HumanPassportClient {
        if (!HumanPassportClient.instance) {
            throw new Error('HumanPassportClient not initialized. Call initialize() first.')
        }
        return HumanPassportClient.instance
    }

    /**
     * Check if client is initialized
     */
    static isInitialized(): boolean {
        return HumanPassportClient.instance !== null
    }

    /**
     * Create a new instance without singleton (for testing or multiple scorers)
     */
    static create(config: HumanPassportConfig): HumanPassportClient {
        return new HumanPassportClient(config)
    }

    /**
     * Get user's score and stamp data from Human Passport API
     *
     * @param address - Ethereum address to check
     * @returns Score data including stamps and passing status
     * @throws HumanPassportException on API errors
     */
    async getScore(address: string): Promise<HumanPassportScore> {
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
            throw new HumanPassportException(
                HumanPassportError.INVALID_ADDRESS,
                `Invalid Ethereum address format: ${address}`
            )
        }

        try {
            const response = await this.axiosInstance.get<RawScoreResponse>(
                `/v2/stamps/${this.config.scorerId}/score/${address}`
            )

            return this.transformScoreResponse(response.data)
        } catch (error: any) {
            throw this.handleApiError(error)
        }
    }

    /**
     * Get user's stamps with optional metadata
     *
     * @param address - Ethereum address to check
     * @param includeMetadata - Include stamp metadata (default: true)
     * @returns Array of stamps
     */
    async getStamps(address: string, includeMetadata = true): Promise<HumanPassportStamp[]> {
        try {
            const response = await this.axiosInstance.get(
                `/v2/stamps/${address}`,
                {
                    params: { include_metadata: includeMetadata }
                }
            )

            return response.data.items || []
        } catch (error: any) {
            throw this.handleApiError(error)
        }
    }

    /**
     * Check if address passes humanity threshold
     *
     * @param address - Ethereum address to check
     * @param threshold - Custom threshold (default: uses scorer's threshold)
     * @returns true if address is considered human
     */
    async isHuman(address: string, threshold?: number): Promise<boolean> {
        const score = await this.getScore(address)

        if (threshold !== undefined) {
            return score.score >= threshold
        }

        return score.passingScore
    }

    /**
     * Get the configured scorer ID
     */
    getScorerId(): string {
        return this.config.scorerId
    }

    /**
     * Transform raw API response to typed score object
     */
    private transformScoreResponse(data: RawScoreResponse): HumanPassportScore {
        return {
            address: data.address,
            score: parseFloat(data.score) || 0,
            passingScore: data.passing_score,
            lastScoreTimestamp: data.last_score_timestamp,
            expirationTimestamp: data.expiration_timestamp,
            threshold: parseFloat(data.threshold) ?? 20,
            stamps: data.stamps || {},
            error: data.error
        }
    }

    /**
     * Handle API errors and convert to HumanPassportException
     */
    private handleApiError(error: any): HumanPassportException {
        if (error.response) {
            const status = error.response.status
            const message = error.response.data?.detail || error.message

            switch (status) {
                case 400:
                    return new HumanPassportException(
                        HumanPassportError.INVALID_ADDRESS,
                        `Invalid address: ${message}`,
                        error.response.data
                    )
                case 404:
                    return new HumanPassportException(
                        HumanPassportError.NO_PASSPORT,
                        'User has not created a Human Passport. Direct them to passport.human.tech',
                        error.response.data
                    )
                case 429:
                    return new HumanPassportException(
                        HumanPassportError.API_RATE_LIMITED,
                        'API rate limit exceeded. Try again later.',
                        error.response.data
                    )
                case 500:
                case 502:
                case 503:
                    return new HumanPassportException(
                        HumanPassportError.API_UNAVAILABLE,
                        `Human Passport API unavailable: ${message}`,
                        error.response.data
                    )
                default:
                    return new HumanPassportException(
                        HumanPassportError.API_UNAVAILABLE,
                        `API error (${status}): ${message}`,
                        error.response.data
                    )
            }
        }

        if (error.code === 'ECONNABORTED') {
            return new HumanPassportException(
                HumanPassportError.API_UNAVAILABLE,
                'Request timeout - Human Passport API did not respond',
                { timeout: true }
            )
        }

        return new HumanPassportException(
            HumanPassportError.API_UNAVAILABLE,
            `Network error: ${error.message}`,
            { originalError: error.message }
        )
    }
}

export default HumanPassportClient
