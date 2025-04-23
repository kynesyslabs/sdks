import { IDefaultChainLocal, required } from "../core"
import { SUI as SUICore } from "@/multichain/core/sui"
import {
    XmTransactionResponse,
    XmTransactionResult,
} from "../core/types/interfaces"

export class SUI extends SUICore implements IDefaultChainLocal {
    private static instances: Map<number, SUI> = new Map<number, SUI>()

    async getInfo() {
        throw new Error("Method not implemented.")
    }

    async sendTransaction(signed_tx: {
        bytes: string
        signature: string
    }): Promise<XmTransactionResponse> {
        required(this.provider, "Provider not connected")

        try {
            const res = await this.provider.executeTransactionBlock({
                transactionBlock: signed_tx.bytes,
                signature: signed_tx.signature,
                options: {
                    showEffects: true,
                },
            })

            return {
                result: XmTransactionResult.success,
                hash: res.digest,
            }
        } catch (error) {
            return {
                result: XmTransactionResult.error,
                error: error,
            }
        }
    }

    public static getInstance(chain_id: number): SUI | null {
        if (!SUI.instances.get(chain_id)) {
            return null
        }

        return SUI.instances.get(chain_id) || null
    }

    public static createInstance(chain_id: number, rpc_url: string): SUI {
        if (!SUI.instances.get(chain_id)) {
            SUI.instances.set(chain_id, new SUI(rpc_url))
        }

        const instance = SUI.instances.get(chain_id)

        if (instance) {
            return instance
        }

        throw new Error("Could not create instance")
    }
}
