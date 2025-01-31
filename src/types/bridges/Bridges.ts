// TODO This interface defines a bridge on a chain (e.g. a controlled bridge for a specific shard on a specific chain)
export interface BridgeContext {
    // TODO Implement the context
    chain: string // ? Should we have an enum for the chains? In general, not only for this interface
    address: string // ? Better types using the chain enum for a public key?
    controllers_properties: {
        seed: string // Seed (CVSA) of the controllers
        reference_block: number // Block number of the reference block forged by the controllers (used to check if the bridge is valid)
    }
    valid_from: number // Block number of the block from which the bridge is valid
    valid_to: number // Block number of the block until which the bridge is valid
}

// TODO This interface defines a bridge operation in a specific context
export interface BridgeOperation {
    id: string // Operation ID (should be the same as the one in the block and is the hash of the operation content)
    content: {
        context: BridgeContext // Exposes the chain, address and controllers properties of the bridge used to perform the operation
        from: string // ? Better types using the chain enum for a public key?
        to: string // ? Better types using the chain enum for a public key?
        currency: string // ? Enum here too?
        amount: number
        max_block_delay: number // Number of blocks before funds are released if the operation is not confirmed
    }
}
