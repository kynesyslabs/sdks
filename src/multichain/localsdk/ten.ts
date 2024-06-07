import * as web3 from "web3"
import { IDefaultChainLocal, TransactionResponse, required } from "../core"
import { TEN as TENCore } from "../core/ten"
import { XmTransactionResult } from "../core/types/interfaces"

export class TEN extends TENCore implements IDefaultChainLocal {
    async sendTransaction(signedTx: string) {
        required(this.provider, "Provider not connected")

        try {
            const res = await this.provider.sendSignedTransaction(signedTx)

            return {
                result: XmTransactionResult.success,
                hash: res.transactionHash.toString(),
            }
        } catch (error) {
            return {
                result: XmTransactionResult.error,
                error: error,
            }
        }
    }

    async getInfo() {
        throw new Error("Method not implemented.")
    }

    async createWallet() {
        return web3.eth.accounts.create()
    }
}