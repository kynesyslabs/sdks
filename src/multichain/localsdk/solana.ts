import { Keypair, Transaction } from "@solana/web3.js"
import { IDefaultChainLocal, SOLANA as SolanaCore, TransactionResponse } from "../core"

export class SOLANA extends SolanaCore implements IDefaultChainLocal {
    constructor(rpc_url: string) {
        super(rpc_url)
    }

    async sendTransaction(
        signed_tx: Transaction,
    ): Promise<TransactionResponse> {
        const tx = signed_tx.serialize()

        try {
            const txhash = await this.provider.sendRawTransaction(tx)
            return {
                result: "success",
                hash: txhash,
            }
        } catch (error) {
            return {
                result: "error",
                error: error,
            }
        }
    }

    async getInfo(){
        throw new Error("Method not implemented.")
    }

    async createWallet(){
        const keypair = Keypair.generate()
        // REVIEW: Should 
        throw new Error("Method not implemented.")
    }
}