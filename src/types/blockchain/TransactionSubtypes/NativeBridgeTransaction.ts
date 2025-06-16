import { Transaction, TransactionContent } from "../Transaction"
import { BridgeOperationCompiled } from "@/bridge/nativeBridgeTypes"

export type NativeBridgeTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'nativeBridge'
    data: ['nativeBridge', BridgeOperationCompiled]
}

export interface NativeBridgeTransaction extends Omit<Transaction, 'content'> {
    content: NativeBridgeTransactionContent
} 