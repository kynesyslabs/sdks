// Logic Execution Payload for Smart Contract-like functionality

export interface ILogicExecutionOperation {
    type: string // TODO: Typize operation types
    payload: any // TODO: Build proper type for operation payload
}

export interface ILogicExecutionPayload {
    operations: ILogicExecutionOperation[]
    metadata?: any // FIXME: Define specific metadata structure
    // REVIEW: Additional fields needed for state changes?
}