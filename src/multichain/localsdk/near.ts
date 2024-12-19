import { KeyPair, transactions } from "near-api-js";
import { IDefaultChainLocal, NEAR as NearCore, required, TransactionResponse } from "../core";
import { SignedTransaction } from "near-api-js/lib/transaction";
import { XmTransactionResult } from "../core/types/interfaces";

export class NEAR extends NearCore implements IDefaultChainLocal {
    async sendTransaction(signed_tx: Uint8Array): Promise<TransactionResponse> {
        const tx = SignedTransaction.decode(signed_tx)

        try {
            const res = await this.provider.connection.provider.sendTransactionUntil(tx, "INCLUDED")
            const txhash = res.transaction.hash

            return {
                result: XmTransactionResult.success,
                hash: txhash
            }
        } catch (error) {
            return {
                result: XmTransactionResult.error,
                error: error
            }
        }
    }

    async getInfo(){
        throw new Error("Method not implemented.");
    }

    async createWallet() {
        return KeyPair.fromRandom('ed25519')
    }

    override async signMessage(message: string, options?: { privateKey?: string }): Promise<string> {
        required(this.wallet || options?.privateKey, "Wallet not connected")
        // TODO Implement the signMessage method
        return "Not implemented"
    }

    override async verifyMessage(message: string, signature: string, publicKey: string): Promise<boolean> {
        // TODO Implement the verifyMessage method
        return false
    }
}
