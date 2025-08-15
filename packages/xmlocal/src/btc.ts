import axios from "axios"
import * as bitcoin from "bitcoinjs-lib"

import { required } from "@kimcalc/utils"
import { BTC as BTCCore } from "@kimcalc/xmcore"
import { XmTransactionResult } from "@kimcalc/xmcore"

export class BTC extends BTCCore {
    private static instances: Map<string, BTC> = new Map<string, BTC>()

    constructor(
        rpcUrl: string,
        network: bitcoin.Network = bitcoin.networks.testnet,
    ) {
        super(rpcUrl, network)
    }

    async sendTransaction(
        signedTxHex: string,
    ): Promise<{ result: string; hash: string }> {
        required(this.provider, "Provider not connected")

        try {
            const url =
                this.provider.includes("blockstream.info") &&
                this.provider.endsWith("/api")
                    ? `${this.provider.slice(0, -4)}/api/tx`
                    : `${this.provider}/tx`

            const response = await axios.post(url, signedTxHex, {
                headers: { "Content-Type": "text/plain" },
            })

            // Blockstream returns txid as a string; adjust if other providers differ
            if (response.data) {
                return {
                    result: XmTransactionResult.success,
                    hash: response.data,
                }
            } else {
                throw new Error(
                    "Failed to send transaction: no txid in response",
                )
            }
        } catch (error) {
            console.error("Error sending transaction:", error)
            throw new Error(
                `Failed to send transaction: ${
                    axios.isAxiosError(error) ? error.message : String(error)
                }`,
            )
        }
    }

    public static createInstance(
        networkType: string,
        rpcUrl: string,
        network: bitcoin.Network,
    ): BTC {
        if (!BTC.instances.has(networkType)) {
            const instance = new BTC(rpcUrl, network)
            BTC.instances.set(networkType, instance)
        }
        const instance = BTC.instances.get(networkType)
        if (instance) {
            return instance
        }
        throw new Error("Could not create or retrieve instance")
    }
}
