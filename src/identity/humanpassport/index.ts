/**
 * Human Passport Identity Module
 *
 * Provides integration with Human Passport (formerly Gitcoin Passport)
 * for Proof of Personhood and Sybil resistance.
 *
 * @module identity/humanpassport
 */

// API Client
export { HumanPassportClient } from './HumanPassportClient'
export { default as HumanPassportClientDefault } from './HumanPassportClient'

// Onchain Verifier
export {
    HumanPassportOnchain,
    type OnchainStamp,
    type OnchainScoreResult
} from './HumanPassportOnchain'
export { default as HumanPassportOnchainDefault } from './HumanPassportOnchain'

// Re-export types from abstraction
export {
    type HumanPassportStamp,
    type HumanPassportScore,
    type HumanPassportIdentityPayload,
    type SavedHumanPassportIdentity,
    type HumanPassportConfig,
    HumanPassportError,
    HumanPassportException
} from '@/abstraction/types/HumanPassportTypes'
