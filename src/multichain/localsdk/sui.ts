import { IDefaultChainLocal } from "../core"
import { SUI as SUICore } from "@/multichain/core/sui"

export class SUI extends SUICore implements IDefaultChainLocal {
    async getInfo() {
        throw new Error("Method not implemented.")
    }

    async sendTransaction(signed_tx: any): Promise<any> {
        return
    }
}
