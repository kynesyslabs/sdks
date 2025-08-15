export interface SmartContractPayload {
    operation: "deploy" | "call"
    
    // Deploy-specific fields
    code?: string
    deployArgs?: any[]
    
    // Call-specific fields
    contractAddress?: string
    method?: string
    args?: any[]
    
    // Optional gas limit
    gasLimit?: number
}