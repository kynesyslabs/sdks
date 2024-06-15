import { KeyPair, mnemonicToPrivateKey, sign } from "@ton/crypto"
import {
    Address,
    Cell,
    TonClient,
    WalletContractV4,
    beginCell,
    internal,
    toNano,
} from "@ton/ton"

import { DefaultChain } from "./types/defaultChain"
import { IPayOptions } from "."
import BigNumber from "bignumber.js"

export class TON extends DefaultChain {
    declare provider: TonClient
    declare signer: KeyPair

    constructor(rpc_url: string) {
        super(rpc_url)
        this.name = "ton"
    }

    async connect() {
        this.provider = new TonClient({
            endpoint: this.rpc_url,
        })

        try {
            const info = await this.provider.getMasterchainInfo()
            console.log(info)
            this.connected = !!info
        } catch (error) {
            console.error(error)
            this.connected = false
        }

        return this.connected
    }

    async connectWallet(mnemonics: string, options?: {}) {
        this.signer = await mnemonicToPrivateKey(mnemonics.split(" "))

        return this.signer
    }

    // SECTION: Information
    getAddress() {
        const wallet = WalletContractV4.create({
            publicKey: this.signer.publicKey,
            workchain: 0,
        })

        return wallet.address.toString()
    }

    async getBalance(address: string) {
        const addr = Address.parse(address)

        const bal = await this.provider.getBalance(addr)
        return new BigNumber(bal as any).toString()
    }

    // SECTION: Transactions

    async signTransactions(txs: Cell[]) {
        // TODO: Test this method
        // NOTE: preparePay signs the tx so this method is not used
        return txs.map(tx => {
            const signature = sign(txs[0].hash(), this.signer.secretKey)

            return beginCell()
                .storeBuffer(signature)
                .storeBuilder(tx.asBuilder())
                .endCell()
        })
    }

    async preparePays(payments: IPayOptions[], options: {}) {
        const wallet = WalletContractV4.create({
            publicKey: this.signer.publicKey,
            workchain: 0,
        })

        wallet.address

        const contract = this.provider.open(wallet)
        const seqNo = await contract.getSeqno()
        console.log("seqNo: ", seqNo)

        const txs = payments.map(payment => {
            return contract.createTransfer({
                seqno: seqNo,
                secretKey: this.signer.secretKey,
                messages: [
                    internal({
                        value: toNano(payment.amount),
                        to: payment.address,
                    }),
                ],
            })
        })

        return txs
    }
}
