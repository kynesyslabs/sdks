import { Cell } from "@ton/ton"
import { mnemonicNew } from "@ton/crypto"

import { TON as TONCore } from "@kimcalc/xmcore"
import { XmTransactionResult } from "@kimcalc/xmcore"
import { IDefaultChainLocal } from "@kimcalc/xmcore"

export class TON extends TONCore implements IDefaultChainLocal {
    async getInfo() {
        throw new Error("Method not implemented.")
    }

    async createWallet(password?: string) {
        return await mnemonicNew(24, password)
    }

    async sendTransaction(signedTx: Buffer) {
        const cell = Cell.fromBoc(signedTx)[0]
        const hash = cell.hash().toString("hex")

        try {
            await this.provider.sendFile(signedTx)
            return {
                hash: hash,
                result: XmTransactionResult.success,
            }
        } catch (error) {
            return {
                error,
                result: XmTransactionResult.error,
            }
        }
    }
}
