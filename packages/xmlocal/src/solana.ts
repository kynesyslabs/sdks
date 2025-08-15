import {
    IDefaultChainLocal,
    SOLANA as SolanaCore,
    TransactionResponse,
} from "@kynesyslabs/xmcore"
import { XmTransactionResult } from "@kynesyslabs/xmcore"

export class SOLANA extends SolanaCore implements IDefaultChainLocal {
    constructor(rpc_url: string) {
        super(rpc_url)
    }

    async sendTransaction(
        serialized_tx: Uint8Array,
    ): Promise<TransactionResponse> {
        try {
            const txhash = await this.provider.sendRawTransaction(
                serialized_tx,
                {
                    preflightCommitment: "processed",
                },
            )

            return {
                result: XmTransactionResult.success,
                hash: txhash,
            }
        } catch (error) {
            return {
                result: XmTransactionResult.error,
                error: error.toString(),
            }
        }
    }

    async getInfo() {
        throw new Error("Method not implemented.")
    }
}
