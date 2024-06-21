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
import BigNumber from "bignumber.js"
import { KeyPair, mnemonicToPrivateKey, sign } from "@ton/crypto"

import { IPayOptions, required } from "."
import { DefaultChain } from "./types/defaultChain"

export class TON extends DefaultChain {
    declare provider: TonClient
    declare signer: KeyPair
    declare wallet: WalletContractV4

    constructor(rpc_url: string) {
        super(rpc_url)
        this.name = "ton"
    }

    override setRpc(rpc_url: string): void {
        this.rpc_url = rpc_url

        this.provider = new TonClient({
            endpoint: this.rpc_url,
        })
    }

    async connect() {
        try {
            const info = await this.provider.getMasterchainInfo()
            this.connected = !!info
        } catch (error) {
            this.connected = false
        }

        return this.connected
    }

    async connectWallet(mnemonics: string) {
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
    async signTransaction(tx: Cell) {
        const txs = await this.signTransactions([tx])
        return txs[0]
    }

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

    async preparePay(
        receiver: string,
        amount: string,
        options?: {
            /**
             * A private key mnemonic to use for signing the transaction(s) instead of the connected wallet
             */
            privateKey: string
        },
    ) {
        const txs = await this.preparePays(
            [{ address: receiver, amount }],
            options,
        )
        return txs[0]
    }

    async preparePays(
        payments: IPayOptions[],
        options?: {
            /**
             * A private key mnemonic to use for signing the transaction(s) instead of the connected wallet
             */
            privateKey: string
        },
    ) {
        required(this.signer || options?.privateKey, "Wallet not connected")

        let signer = this.signer

        if (options?.privateKey) {
            signer = await mnemonicToPrivateKey(options.privateKey.split(" "))
        }

        const contract = this.provider.open(this.wallet)
        let seqNo = await contract.getSeqno()

        const txs = payments.map(payment => {
            const cell = contract.createTransfer({
                seqno: seqNo,
                secretKey: signer.secretKey,
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
        // NOTE: All this is done to retrieve the the final tx hash
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

            // INFO: Convert the cell to a buffer for network transmission
            return boc.toBoc()
        })
    }

    async getEmptyTransaction() {
        return beginCell()
    }
}
