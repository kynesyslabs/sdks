// SECTION: SOLANA
export interface SolNativeTransfer {
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
}

export interface SolTokenBalanceChange {
    // Add specific token balance change properties as needed
    [key: string]: any;
}

export interface SolAccountData {
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: SolTokenBalanceChange[];
}

export interface SolInstruction {
    accounts: string[];
    data: string;
    programId: string;
    innerInstructions: any[]; // Can be more specific based on actual inner instruction structure
}

export interface SolTransaction {
    description: string;
    type: string;
    source: string;
    fee: number;
    feePayer: string;
    signature: string;
    slot: number;
    timestamp: number;
    tokenTransfers: any[]; // Can be more specific based on actual token transfer structure
    nativeTransfers: SolNativeTransfer[];
    accountData: SolAccountData[];
    transactionError: any | null;
    instructions: SolInstruction[];
    events: Record<string, any>;
}

export type SolanaTransactionResponse = SolTransaction[];

// SECTION: ETHEREUM
export interface EthTransaction {
    blockNumber: string;
    timeStamp: string;
    hash: string;
    nonce: string;
    blockHash: string;
    transactionIndex: string;
    from: string;
    to: string;
    value: string;
    gas: string;
    gasPrice: string;
    isError: string;
    txreceipt_status: string;
    input: string;
    contractAddress: string;
    cumulativeGasUsed: string;
    gasUsed: string;
    confirmations: string;
    methodId: string;
    functionName: string;
}

export interface EthTransactionResponse {
    status: string;
    message: string;
    result: EthTransaction[];
}
