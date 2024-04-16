import { Operation } from "../Operation"

export interface ExecutionResult {
    response: any
    extra: any
    require_reply: boolean
    operations?: Operation[]
}