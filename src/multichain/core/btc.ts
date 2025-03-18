import * as bitcoin from "bitcoinjs-lib"
import { required } from "./utils"
import axios from "axios"
import { ECPairAPI, ECPairFactory, ECPairInterface } from "ecpair"
import * as ecc from "tiny-secp256k1"
import { DefaultChain } from "@/multichain/core/types/defaultChain"
import { IPayParams } from "@/multichain/core/types/interfaces"

const ECPair: ECPairAPI = ECPairFactory(ecc)

export class BTC extends DefaultChain {
    declare provider: string
    network: bitcoin.Network
    override wallet: ECPairInterface
    address?: string
    private readonly DUST_LIMIT_P2PKH = 546

    constructor(
        rpc_url: string,
        network: bitcoin.Network = bitcoin.networks.testnet,
    ) {
        super(rpc_url)
        this.name = "btc"
        this.provider = rpc_url
        this.network = network
    }

    async connect(): Promise<boolean> {
        try {
            console.log("Connecting to provider:", this.provider)
            const url =
                this.provider.includes("blockstream.info") &&
                this.provider.endsWith("/api")
                    ? `${this.provider.slice(0, -4)}/api/blocks/tip/height`
                    : `${this.provider}/api/blocks/tip/height`
            const response = await axios.get(url)
            console.log("Block height response:", response.data)
            this.connected = true
            return true
        } catch (error) {
            console.error("BTC connection error:", error)
            this.connected = false
            return false
        }
    }

    async connectWallet(privateKeyWIF: string): Promise<ECPairInterface> {
        try {
            this.wallet = ECPair.fromWIF(privateKeyWIF, this.network)
            const pubkeyBuffer = Buffer.from(this.wallet.publicKey)
            const { address } = bitcoin.payments.p2pkh({
                pubkey: pubkeyBuffer,
                network: this.network,
            })
            this.address = address
            return this.wallet
        } catch (error) {
            console.error("Error connecting wallet:", error)
            throw error
        }
    }

    getAddress(): string {
        required(this.address, "Wallet not connected")
        return this.address!
    }

    async fetchUTXOs(address: string): Promise<any[]> {
        try {
            const url =
                this.provider.includes("blockstream.info") &&
                this.provider.endsWith("/api")
                    ? `${this.provider.slice(
                          0,
                          -4,
                      )}/api/address/${address}/utxo`
                    : `${this.provider}/address/${address}/utxo`
            const response = await axios.get(url)
            if (!response || !response.data) {
                throw new Error("Failed to get UTXO: response is empty")
            }
            console.log("Received UTXOs:", response.data)
            return response.data
        } catch (error) {
            console.error("Error while receiving UTXO:", error)
            return []
        }
    }

    async getTxHex(txid: string): Promise<string> {
        try {
            const url =
                this.provider.includes("blockstream.info") &&
                this.provider.endsWith("/api")
                    ? `${this.provider.slice(0, -4)}/api/tx/${txid}/hex`
                    : `${this.provider}/tx/${txid}/hex`
            console.log("txHex query for txid:", url)
            const response = await axios.get(url)
            if (!response.data) throw new Error("Empty response from API")
            console.log("Received txHex:", response.data)
            return response.data
        } catch (error) {
            console.error("Error in getTxHex:", error)
            if (axios.isAxiosError(error)) {
                console.error("Error status:", error.response?.status)
                console.error("Error data:", error.response?.data)
            }
            throw new Error(`Failed to get txHex for txid: ${txid}`)
        }
    }

    private toSigner(ecpair: ECPairInterface): bitcoin.Signer {
        return {
            publicKey: Buffer.from(ecpair.publicKey),
            sign: (hash: Buffer, lowR?: boolean) =>
                Buffer.from(ecpair.sign(hash)),
        }
    }

    async preparePay(address: string, amount: string): Promise<string> {
        const amountNum = parseInt(amount, 10)
        if (isNaN(amountNum) || amountNum <= 0)
            throw new Error("Incorrect amount")

        const sender = this.getAddress()
        const utxos = await this.fetchUTXOs(sender)

        const psbt = new bitcoin.Psbt({ network: this.network })
        let totalInput = 0
        const feeRate = 10 // satoshi per byte

        for (const utxo of utxos) {
            const txHex = await this.getTxHex(utxo.txid)
            psbt.addInput({
                hash: utxo.txid,
                index: utxo.vout,
                nonWitnessUtxo: Buffer.from(txHex, "hex"),
            })
            totalInput += utxo.value
        }

        if (totalInput < amountNum) throw new Error("Insufficient funds")

        psbt.addOutput({
            address,
            value: amountNum,
        })

        const txSizeEstimate = 200 + utxos.length * 148
        const estimatedFee = txSizeEstimate * feeRate

        const change = totalInput - amountNum - estimatedFee
        if (change > this.DUST_LIMIT_P2PKH) {
            psbt.addOutput({
                address: sender,
                value: change,
            })
        }

        psbt.signAllInputs(this.toSigner(this.wallet!))
        psbt.finalizeAllInputs()

        const tx = psbt.extractTransaction()
        return tx.toHex()
    }

    async preparePays(payments: IPayParams[]): Promise<string[]> {
        return Promise.all(
            payments.map(p => this.preparePay(p.address, p.amount as string)),
        )
    }

    async getBalance(address: string): Promise<string> {
        const utxos = await this.fetchUTXOs(address)
        if (!utxos || utxos.length === 0) {
            console.log("UTXO not found for address:", address)
            return "0"
        }
        return utxos.reduce((sum, utxo) => sum + utxo.value, 0).toString()
    }

    async getEmptyTransaction(): Promise<any> {
        return {
            version: 2,
            locktime: 0,
            ins: [],
            outs: [],
        }
    }

    async signMessage(
        message: string,
        options?: { privateKey?: string },
    ): Promise<string> {
        throw new Error("Not implemented")
    }

    async verifyMessage(
        message: string,
        signature: string,
        publicKey: string,
    ): Promise<boolean> {
        throw new Error("Not implemented")
    }

    async signTransaction(): Promise<void> {
        throw new Error("Not implemented")
    }

    async signTransactions(): Promise<any[]> {
        throw new Error("Not implemented")
    }
}
