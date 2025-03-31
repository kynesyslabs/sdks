import * as bitcoin from "bitcoinjs-lib"
import { BIP32Factory } from "bip32"
import * as ecc from "tiny-secp256k1"
import { required } from "./utils"
import axios from "axios"
import { ECPairAPI, ECPairFactory, ECPairInterface } from "ecpair"
import { DefaultChain } from "@/multichain/core/types/defaultChain"
import { IPayParams } from "@/multichain/core/types/interfaces"

const ECPair: ECPairAPI = ECPairFactory(ecc)
const bip32 = BIP32Factory(ecc)

const BITCOIN_CONSTANTS = {
    DUST_LIMIT_P2WPKH: 294,
    BASE_TX_SIZE: 10,
    INPUT_SIZE: 68,
    OUTPUT_SIZE: 31,
    SAT_PER_VBYTE: 1,
    DEFAULT_NETWORK: bitcoin.networks.testnet, // Default Bitcoin network
}

export class BTC extends DefaultChain {
    declare provider: string
    network: bitcoin.Network
    override wallet: ECPairInterface
    address?: string
    private changeIndex: number = 0
    private changeAddresses: string[] = []

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

    private generateChangeAddress(): string {
        const seed = this.wallet.privateKey!
        const root = bip32.fromSeed(seed, this.network)
        const child = root.derivePath(`m/84'/1'/0'/1/${this.changeIndex++}`)
        const { address } = bitcoin.payments.p2wpkh({
            pubkey: Buffer.from(child.publicKey),
            network: this.network,
        })
        this.changeAddresses.push(address!) // Save the change address
        return address!
    }

    async connectWallet(privateKeyWIF: string): Promise<ECPairInterface> {
        try {
            this.wallet = ECPair.fromWIF(privateKeyWIF, this.network)
            const { address } = bitcoin.payments.p2wpkh({
                pubkey: Buffer.from(this.wallet.publicKey),
                network: this.network,
            })
            this.address = address
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
            const response = await axios.get(url)
            const utxos = response.data || []
            return utxos
        } catch (error) {
            throw new Error(`Error receiving UTXOs: ${error}`)
        }
    }

    async fetchAllUTXOs(): Promise<any[]> {
        const mainAddressUTXOs = await this.fetchUTXOs(this.getAddress())

        const changeUTXOsPromises = this.changeAddresses.map(async address => {
            const utxos = await this.fetchUTXOs(address)
            return utxos
        })
        const changeUTXOs = (await Promise.all(changeUTXOsPromises)).flat()

        const allUTXOs = [...mainAddressUTXOs, ...changeUTXOs]
        return allUTXOs
    }

    async getTxHex(txid: string): Promise<string> {
        try {
            const url = this.getApiUrl(`/tx/${txid}/hex`)
            const response = await axios.get(url)
            const txHex = response.data
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

    async preparePay(
        address: string,
        amount: string,
        overrideFeeRate?: number,
        addNoise: boolean = false,
    ): Promise<string> {
        const txs = await this.preparePays(
            [{ address, amount }],
            overrideFeeRate,
            addNoise,
        )
        return txs[0]
    }

    async preparePays(
        payments: IPayParams[],
        overrideFeeRate?: number,
        addNoise: boolean = false,
    ): Promise<string[]> {
        required(this.wallet, "Wallet not connected")
        let availableUtxos = await this.fetchAllUTXOs()
        const psbts: bitcoin.Psbt[] = []

        for (const payment of payments) {
            const { psbt, usedUtxos } = await this.createUnsignedPSBT(
                payment.address,
                payment.amount as string,
                availableUtxos,
                overrideFeeRate,
                addNoise,
            )
            psbts.push(psbt)
            availableUtxos = availableUtxos.filter(
                utxo =>
                    !usedUtxos.some(
                        used =>
                            used.txid === utxo.txid && used.vout === utxo.vout,
                    ),
            )
        }

        return this.signTransactions(psbts)
    }

    private async createUnsignedPSBT(
        address: string,
        amount: string,
        availableUtxos: any[],
        overrideFeeRate?: number,
        addNoise: boolean = false,
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
        ) // Sort in descending order
        const p2wpkh = bitcoin.payments.p2wpkh({
            pubkey: Buffer.from(this.wallet.publicKey),
            network: this.network,
        })

        // Minimize the number of inputs
        const outputCount = addNoise ? 3 : 2 // Estimated number of outputs
        let estimatedFee = await this.calculateFee(
            1,
            outputCount,
            overrideFeeRate,
        ) // Rating for 1 entry

        for (const utxo of sortedUtxos) {
            psbt.addInput({
                hash: utxo.txid,
                index: utxo.vout,
                witnessUtxo: {
                    script: p2wpkh.output!,
                    value: utxo.value,
                },
            })
            totalInput += utxo.value
            inputCount++
            usedUtxos.push({ txid: utxo.txid, vout: utxo.vout })

            // Recalculate the commission taking into account the current number of inputs
            estimatedFee = await this.calculateFee(
                inputCount,
                outputCount,
                overrideFeeRate,
            )
            if (totalInput >= amountNum + estimatedFee) break // break as soon as have enough
        }

        // Finally calculate the commission
        const finalFee = await this.calculateFee(
            inputCount,
            outputCount,
            overrideFeeRate,
        )
        if (totalInput < amountNum + finalFee) {
            throw new Error(
                `Insufficient funds: There is ${totalInput}, need ${
                    amountNum + finalFee
                }`,
            )
        }

        psbt.addOutput({
            address,
            value: amountNum,
        })

        const change = totalInput - amountNum - finalFee
        let remainingChange = change

        if (
            addNoise &&
            remainingChange >= BITCOIN_CONSTANTS.DUST_LIMIT_P2WPKH * 2
        ) {
            const noiseAmount = Math.floor(remainingChange / 3)
            if (noiseAmount >= BITCOIN_CONSTANTS.DUST_LIMIT_P2WPKH) {
                const noiseAddress = this.generateChangeAddress()
                psbt.addOutput({
                    address: noiseAddress,
                    value: noiseAmount,
                })
                remainingChange -= noiseAmount
            }
        }

        if (remainingChange >= BITCOIN_CONSTANTS.DUST_LIMIT_P2WPKH) {
            // Need to change to generated address for security
            // const changeAddress = this.generateChangeAddress();
            psbt.addOutput({
                address: sender,
                value: remainingChange,
            })
        } else if (remainingChange > 0) {
            console.log(
                `The remaining ${remainingChange} satoshi went to the commission`,
            )
        }

        return { psbt, usedUtxos }
    }

    async getFeeRate(overrideRate?: number): Promise<number> {
        if (overrideRate !== undefined) {
            return overrideRate
        }
        try {
            const url = this.getApiUrl("/fee-estimates")
            const response = await axios.get(url)
            // "2" means evaluation for confirmation within 2 blocks
            const feeRate =
                Math.ceil(response.data["2"]) || BITCOIN_CONSTANTS.SAT_PER_VBYTE
            return feeRate > 0 ? feeRate : BITCOIN_CONSTANTS.SAT_PER_VBYTE
        } catch (error) {
            console.error("Error receiving commission, using standard:", error)
            return BITCOIN_CONSTANTS.SAT_PER_VBYTE
        }
    }

    private async calculateFee(
        inputsCount: number,
        outputsCount: number,
        overrideFeeRate?: number,
    ): Promise<number> {
        const txSize =
            BITCOIN_CONSTANTS.BASE_TX_SIZE +
            inputsCount * BITCOIN_CONSTANTS.INPUT_SIZE +
            outputsCount * BITCOIN_CONSTANTS.OUTPUT_SIZE
        const feeRate = await this.getFeeRate(overrideFeeRate)
        const fee = Math.ceil(txSize * feeRate)
        return fee
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

    async getBalance(): Promise<string> {
        const utxos = await this.fetchAllUTXOs()
        const totalBalance = utxos.reduce((sum, utxo) => sum + utxo.value, 0)
        return totalBalance.toString()
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
