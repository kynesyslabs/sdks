import * as xrpl from 'xrpl'
import { IDefaultChainLocal, XRPL as XRPLSdkCore } from '@demos/mx-core'

export default class XRPL extends XRPLSdkCore implements IDefaultChainLocal {
    constructor(rpc_url: string) {
        super(rpc_url)
    }

    // INFO Creates a new wallet
    async createWallet(password: string) {
        // TODO: Review this implementation
        this.wallet = xrpl.Wallet.generate()
    }

    async getInfo() {
        throw new Error('Method not implemented.')
    }

    // INFO Generic account info
    async accountInfo(address: string): Promise<xrpl.AccountInfoResponse> {
        return await this.provider.request({
            command: 'account_info',
            account: address,
            ledger_index: 'validated',
        })
    }

    // INFO Generic sign, send and await (if not specified) a tx
    async sendTransaction(signed: any, wait: boolean = false) {
        // Sending the tx
        console.log('[xrpl] sendtransaction')

        if (wait) {
            const res = await this.provider.submitAndWait(signed.tx_blob)

            // NOTE: The return type here might need to change
            return {
                result: 'success',
                hash: res.result.hash,
            }
        } else {
            const res = await this.provider.submit(signed.tx_blob)

            return {
                result: res.result.accepted ? 'success' : 'error',
                hash: res.result.tx_json.hash,
                extra: {
                    accepted: res.result.accepted,
                    result: res.result.engine_result,
                    result_code: res.result.engine_result_code,
                    result_message: res.result.engine_result_message,
                },
            }
        }
    }
}
