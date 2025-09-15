import { Transaction, TransactionContent } from "../Transaction"
import { BridgeOperationCompiled, NativeBridgeTxPayload } from "@/bridge/nativeBridgeTypes"

export type NativeBridgeTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'nativeBridge'
    data: ['nativeBridge', NativeBridgeTxPayload]
}

export interface NativeBridgeTransaction extends Omit<Transaction, 'content'> {
    content: NativeBridgeTransactionContent
} 