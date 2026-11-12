import L2PS from "./l2ps"
import { L2PSConfig, L2PSEncryptedBytes, L2PSEncryptedPayload } from "./l2ps"

export { L2PS, L2PSConfig, L2PSEncryptedBytes, L2PSEncryptedPayload }

export {
    L2PSHistoryEntry,
    L2PSHistoryOptions,
    L2PSHistoryPage,
    l2psHistoryAuthMessage,
    legacyL2psHistoryAuthMessage,
    L2PS_HISTORY_AUTH_WINDOW_MS,
} from "./history"

export * as binding from "./binding"
export * as channel from "./channel"
export * as anchor from "./anchor"
export * as agreement from "./agreement"

export {
    buildSettledL2PSTransfer,
    l2psSettlementCommitment,
    l2psSettlementMessage,
    l2psSettlementSalt,
    l2psAccountLimbs,
    l2psFieldToHex,
    l2psHexToField,
    L2PS_SETTLEMENT_VERSION,
    L2PS_SETTLEMENT_SIGNATURE_DOMAIN,
    L2PS_SETTLEMENT_AMOUNT_LIMIT,
    L2PS_SETTLEMENT_NONCE_LIMIT,
    L2PS_SETTLEMENT_SALT_BYTES,
} from "./settlement"
export type { L2PSSettlementOpening, SettledL2PSTransferOptions } from "./settlement"
export type {
    L2PSTransferSettlement,
    L2PSInnerSendPayload,
} from "@/types/blockchain/TransactionSubtypes/L2PSTransaction"
