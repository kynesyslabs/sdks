import { KeyPair } from "near-api-js";
import { SignedTransaction } from "near-api-js/lib/transaction";

import { XmTransactionResult } from "@kynesyslabs/xmcore";
import { IDefaultChainLocal, NEAR as NearCore, TransactionResponse } from "@kynesyslabs/xmcore";

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

    async getInfo() {
        throw new Error("Method not implemented.");
    }

    async createWallet() {
        return KeyPair.fromRandom('ed25519')
    }
}
