import * as bitcoin from "bitcoinjs-lib"
import { required } from "./utils"
import axios from "axios"
import { ECPairAPI, ECPairFactory, ECPairInterface } from "ecpair"
import * as ecc from "tiny-secp256k1"
import { DefaultChain } from "@/multichain/core/types/defaultChain"
import { IPayParams } from "@/multichain/core/types/interfaces"

const ECPair: ECPairAPI = ECPairFactory(ecc)

const BITCOIN_CONSTANTS = {
    DUST_LIMIT_P2PKH: 546,
    BASE_TX_SIZE: 10,
    INPUT_SIZE: 148,
    OUTPUT_SIZE: 34,
    SAT_PER_VBYTE: 10,
    DEFAULT_NETWORK: bitcoin.networks.testnet, // Default Bitcoin network
}

export class BTC extends DefaultChain {
    declare provider: string
    network: bitcoin.Network
    override wallet: ECPairInterface
    address?: string

    constructor(
        rpc_url: string,
        network: bitcoin.Network = BITCOIN_CONSTANTS.DEFAULT_NETWORK,
    ) {
        super(rpc_url)
        this.name = "btc"
        this.provider = rpc_url
        this.network = network
    }

    async connect(): Promise<boolean> {
        try {
            const url = this.getApiUrl("/blocks/tip/height")
            const response = await axios.get(url)
            this.connected = !!response.data
            return this.connected
        } catch (error) {
            console.error("BTC connection error:", error)
            this.connected = false
            return false
        }
    }

    async connectWallet(privateKeyWIF: string): Promise<ECPairInterface> {
        try {
            this.wallet = ECPair.fromWIF(privateKeyWIF, this.network)
            const { address } = bitcoin.payments.p2pkh({
                pubkey: Buffer.from(this.wallet.publicKey),
                network: this.network,
            })
            this.address = address
            console.log("Wallet connected, address:", address)
            return this.wallet
        } catch (error) {
            throw new Error(`Failed to connect wallet: ${error}`)
        }
    }

    getAddress(): string {
        required(this.address, "Wallet not connected")
        return this.address!
    }

    private getApiUrl(path: string): string {
        const baseUrl = this.provider.replace(/\/api$/, "")
        return `${baseUrl}/api${path}`
    }

    async fetchUTXOs(address: string): Promise<any[]> {
        try {
            const url = this.getApiUrl(`/address/${address}/utxo`)
            console.log("Fetching UTXOs from:", url)
            const response = await axios.get(url)
            const utxos = response.data || []
            console.log("Fetched UTXOs:", utxos)
            return utxos
        } catch (error) {
            throw new Error(`Failed to fetch UTXOs: ${error}`)
        }
    }

    async getTxHex(txid: string): Promise<string> {
        try {
            const url = this.getApiUrl(`/tx/${txid}/hex`)
            console.log("Fetching tx hex for:", txid)
            const response = await axios.get(url)
            const txHex = response.data
            console.log("Fetched tx hex:", txHex)
            return txHex
        } catch (error) {
            throw new Error(`Failed to get transaction hex: ${error}`)
        }
    }

    private toSigner(ecpair: ECPairInterface): bitcoin.Signer {
        return {
            publicKey: Buffer.from(ecpair.publicKey),
            sign: (hash: Buffer, lowR?: boolean) => {
                const signature = ecpair.sign(hash, lowR)
                return Buffer.from(signature)
            },
        }
    }

    async preparePay(address: string, amount: string): Promise<string> {
        console.log("Preparing payment to:", address, "for amount:", amount)
        const txs = await this.preparePays([{ address, amount }])
        return txs[0]
    }

    async preparePays(payments: IPayParams[]): Promise<string[]> {
        required(this.wallet, "Wallet not connected")
        const sender = this.getAddress()
        let availableUtxos = await this.fetchUTXOs(sender)
        const psbts: bitcoin.Psbt[] = []

        for (const payment of payments) {
            console.log("Creating PSBT for payment:", payment)
            const { psbt, usedUtxos } = await this.createUnsignedPSBT(
                payment.address,
                payment.amount as string,
                availableUtxos,
            )
            psbts.push(psbt)
            availableUtxos = availableUtxos.filter(
                utxo =>
                    !usedUtxos.some(
                        used =>
                            used.txid === utxo.txid && used.vout === utxo.vout,
                    ),
            )
            console.log("Remaining UTXOs:", availableUtxos)
        }

        return this.signTransactions(psbts)
    }

    private async createUnsignedPSBT(
        address: string,
        amount: string,
        availableUtxos: any[],
    ): Promise<{
        psbt: bitcoin.Psbt
        usedUtxos: { txid: string; vout: number }[]
    }> {
        const amountNum = Number(amount)
        if (isNaN(amountNum) || amountNum <= 0)
            throw new Error("Incorrect amount")

        const sender = this.getAddress()
        if (availableUtxos.length === 0) throw new Error("No UTXOs available")

        const psbt = new bitcoin.Psbt({ network: this.network })
        let totalInput = 0
        let inputCount = 0
        const usedUtxos: { txid: string; vout: number }[] = []

        const sortedUtxos = [...availableUtxos].sort(
            (a, b) => b.value - a.value,
        )
        console.log("Sorted UTXOs:", sortedUtxos)

        for (const utxo of sortedUtxos) {
            const txHex = await this.getTxHex(utxo.txid)
            psbt.addInput({
                hash: utxo.txid,
                index: utxo.vout,
                nonWitnessUtxo: Buffer.from(txHex, "hex"),
            })
            totalInput += utxo.value
            inputCount++
            usedUtxos.push({ txid: utxo.txid, vout: utxo.vout })
            const currentFee = this.calculateFee(inputCount, 2)
            if (totalInput >= amountNum + currentFee) break
        }

        const finalFee = this.calculateFee(inputCount, 2)
        if (totalInput < amountNum + finalFee) {
            throw new Error(
                `Insufficient funds: have ${totalInput}, need ${
                    amountNum + finalFee
                }`,
            )
        }

        psbt.addOutput({
            address,
            value: amountNum,
        })

        const change = totalInput - amountNum - finalFee
        if (change >= BITCOIN_CONSTANTS.DUST_LIMIT_P2PKH) {
            psbt.addOutput({
                address: sender,
                value: change,
            })
        }

        console.log("Created PSBT with inputs:", usedUtxos, "outputs:", {
            payment: amountNum,
            change,
        })
        return { psbt, usedUtxos }
    }

    private calculateFee(inputsCount: number, outputsCount: number): number {
        const txSize =
            BITCOIN_CONSTANTS.BASE_TX_SIZE +
            inputsCount * BITCOIN_CONSTANTS.INPUT_SIZE +
            outputsCount * BITCOIN_CONSTANTS.OUTPUT_SIZE
        return txSize * BITCOIN_CONSTANTS.SAT_PER_VBYTE
    }

    async signTransaction(psbt: bitcoin.Psbt): Promise<string> {
        const [signed] = await this.signTransactions([psbt])
        return signed
    }

    async signTransactions(psbts: bitcoin.Psbt[]): Promise<string[]> {
        required(this.wallet, "Wallet not connected")

        return psbts.map(psbt => {
            psbt.signAllInputs(this.toSigner(this.wallet))
            psbt.finalizeAllInputs()
            const tx = psbt.extractTransaction()

            return tx.toHex()
        })
    }

    async getBalance(address: string): Promise<string> {
        const utxos = await this.fetchUTXOs(address)
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

    async signMessage(): Promise<string> {
        throw new Error("Method not implemented")
    }

    async verifyMessage(): Promise<boolean> {
        throw new Error("Method not implemented")
    }
}
