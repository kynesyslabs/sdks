import {
    IDefaultChainLocal,
    SOLANA as SolanaCore,
    TransactionResponse,
} from "../core"

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
                result: "success",
                hash: txhash,
            }
        } catch (error) {
            return {
                result: "error",
                error: error.toString(),
            }
        }
    }

    async getInfo() {
        throw new Error("Method not implemented.")
    }
}
