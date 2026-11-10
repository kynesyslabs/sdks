// Validator state as exposed by the node's RPC surface.

/** Status codes written into the Validators table. */
export type ValidatorStatus =
    | "0"    // exited
    | "2"    // active
    | "3"    // unstaking (lock armed, still in validator set until exit)

/** What `getValidatorInfo`, `getValidators` and `getValidatorByMint` return per row. */
export interface ValidatorInfo {
    address: string
    status: ValidatorStatus | string
    connectionUrl: string | null
    stakedAmount: string        // bigint-as-string
    firstSeen: number | null
    validAt: number | null
    unstakeRequestedAt: number | null
    unstakeAvailableAt: number | null
    /** Solana mint of the NFT backing the seat; null before the NFT gate. */
    nftMint: string | null
    /** Solana wallet that held the NFT when the seat was taken. */
    nftOwner: string | null
    /** Signature of the Solana proof transaction. */
    nftProofTx: string | null
}
