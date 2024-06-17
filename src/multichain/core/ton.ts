import { KeyPair, mnemonicToPrivateKey, sign } from "@ton/crypto"
import {
    Address,
    Cell,
    TonClient,
    WalletContractV4,
    beginCell,
    external,
    internal,
    storeMessage,
    toNano,
} from "@ton/ton"

import { DefaultChain } from "./types/defaultChain"
import { IPayOptions } from "."
import BigNumber from "bignumber.js"

export class TON extends DefaultChain {
    declare provider: TonClient
    declare signer: KeyPair
    declare wallet: WalletContractV4

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
        this.wallet = WalletContractV4.create({
            publicKey: this.signer.publicKey,
            workchain: 0,
        })

        return this.wallet
    }

    // SECTION: Information
    getAddress() {
        return this.wallet.address.toString()
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
        const contract = this.provider.open(this.wallet)
        let seqNo = await contract.getSeqno()
        console.log("seqNo: ", seqNo)

        const txs = payments.map(payment => {
            const cell = contract.createTransfer({
                seqno: seqNo,
                secretKey: this.signer.secretKey,
                messages: [
                    internal({
                        value: toNano(payment.amount),
                        to: payment.address,
                    }),
                ],
            })

            seqNo++

            return cell
        })

        return await this.cellsToSendableFile(txs)
    }

    /**
     * Prepare a cell to be sent to the network.
     *
     * @param cell The cell to convert to a sendable file
     * @returns The cell as a sendable file
     */
    async cellsToSendableFile(cells: Cell[]) {
        // NOTE: All this is done to get the final tx hash
        const contract = this.provider.open(this.wallet)
        let neededInit = null

        const address = Address.parse(this.getAddress())
        const isContractDeployed = await this.provider.isContractDeployed(
            address,
        )

        if (contract.init && !isContractDeployed) {
            neededInit = contract.init
        }

        return cells.map(cell => {
            // INFO: Create an external message
            const ext = external({
                to: this.getAddress(),
                init: neededInit,
                body: cell,
            })

            // INFO: Create a new cell with the external message
            let boc = beginCell().store(storeMessage(ext)).endCell()

            console.log("boc hash: ", boc.hash().toString("hex"))

            // INFO: Convert the cell to a buffer for network transmission
            return boc.toBoc()
        })
    }

    async getEmptyTransaction() {
        return beginCell()
    }
}
