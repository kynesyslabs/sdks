import { Operation } from '../gls/Operation'

export interface ExecutionResult {
    success: boolean
    response: any
    extra: any
    require_reply: boolean
    operations?: Operation[]
}
