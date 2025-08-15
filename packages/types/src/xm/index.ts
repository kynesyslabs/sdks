
export interface ITask {
    type: string
    params: any // TODO Define a decent type for this and use it everywhere
    // TODO AND NOTE
    // Here the client should send
    // the signed transactions that it requires
    signedPayloads: any[]
}
export interface IOperation {
    chain: string
    subchain: string
    is_evm: boolean
    rpc: string
    task: ITask
}

export interface XMScript {
    operations: { [key: string]: IOperation },
    operations_order: string[]
}