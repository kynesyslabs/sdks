// SECTION Primitives

export interface GenesisImmutableProperties {
    id: number
    name: string
    currency: string
}

export interface GenesisMutableProperties {
    minBlocksForValidationOnlineStatus: number
}

export interface GenesisArtifact {
    properties: GenesisImmutableProperties
    mutables: GenesisMutableProperties
    balances: [[address: string, amount: string]]
    timestamp: number
    previous_genesis_hash: string
    previous_block_hash: string
    signature: string
    hash: string
    number: number
}

// !SECTION Primitives

// SECTION Components

export interface StandardGenesis {
    properties: GenesisImmutableProperties
    mutables: GenesisMutableProperties
    balances: [[address: string, amount: string]]
    timestamp: number
}

export interface forkGenesis extends StandardGenesis {
    previous_genesis_hash: string
    previous_block_hash: string
}