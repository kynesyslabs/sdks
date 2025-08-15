// import * as web3 from "web3"

// import { TEN as TENCore } from "@kimcalc/xmcore"
// import { XmTransactionResult } from "@kimcalc/xmcore"
// import { IDefaultChainLocal } from "@kimcalc/xmcore"
// import { required } from "@kimcalc/utils"

// export class TEN extends TENCore implements IDefaultChainLocal {
//     async sendTransaction(signedTx: string) {
//         required(this.provider, "Provider not connected")

//         try {
//             const res = await this.provider.sendSignedTransaction(signedTx)

//             return {
//                 result: XmTransactionResult.success,
//                 hash: res.transactionHash.toString(),
//             }
//         } catch (error) {
//             return {
//                 result: XmTransactionResult.error,
//                 error: error,
//             }
//         }
//     }

//     async getInfo() {
//         throw new Error("Method not implemented.")
//     }

//     async createWallet() {
//         return web3.eth.accounts.create()
//     }
// }