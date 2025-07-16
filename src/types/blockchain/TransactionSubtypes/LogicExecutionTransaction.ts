import { Transaction, TransactionContent } from "../Transaction"
import { ILogicExecutionPayload } from "@/types/logicexecution"

export type LogicExecutionTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'logic_execution'
    data: ['logic_execution', ILogicExecutionPayload]
}

export interface LogicExecutionTransaction extends Omit<Transaction, 'content'> {
    content: LogicExecutionTransactionContent
}