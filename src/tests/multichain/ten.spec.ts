import { Web3 } from "web3"
import { getAddress, Transaction, Wallet, JsonRpcProvider } from "ethers"
import { toWei, toNumber } from "web3-utils"

import { TEN } from "@/multichain/core/ten"
import { TEN as TENLOCAL } from "@/multichain/localsdk/ten"
import chainProviders from "./chainProviders"
import { wallets } from "../utils/wallets"
import { getSampleTranfers, verifyNumberOrder } from "../utils"
import { EVM } from "@/multichain/core"

describe("TEN CHAIN TESTS", () => {
    const chain = "ten"
    const rpc_url =
        chain === "ten"
            ? chainProviders.ten.testnet
            : chainProviders.eth.sepolia
    const privateKey = wallets["ten"].privateKey

    const instance = new TEN(rpc_url)

    beforeAll(async () => {
        const connected = await instance.connect()
        expect(connected).toBe(true)

        await instance.connectWallet(privateKey)
        expect(instance.getAddress()).toBeDefined()
    })

    test.skip("Sending a tx using ethers v6", async () => {

        const provider = new JsonRpcProvider(rpc_url)
        const wallet = new Wallet(privateKey)

        const chainId = (await provider.getNetwork()).chainId
        const nonce = await provider.getTransactionCount(wallet.address)

        const feeData = await provider.getFeeData()
        console.log("feeData: ", feeData)

        const tx = {
            nonce,
            chainId,
            type: 2,
            to: "0x4298A9D2A573dA64102255d11d6908b7e3d89b02",
            value: toNumber(toWei("0.01", "ether")),
            gasLimit: 21000,
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        }

        const signedTx = await wallet.signTransaction(tx)
        console.log("signedTx: ", signedTx)

        const res = await provider.broadcastTransaction(signedTx)
        console.log("res: ", res)

        const receipt = await provider.waitForTransaction(res.hash)
        console.log("receipt: ", receipt)

    }, 30000000)

    test("A tx is signed with the ledger nonce", async () => {
        const address = instance.getAddress()
        const ledgerNonce = await instance.provider.getTransactionCount(address)

        const signed_tx = await instance.preparePay(address, "12")

        // INFO: Reconstruct the transaction from the signed payload
        // INFO: I couldn't find how to recover the raw tx using web3js
        const tx = Transaction.from(signed_tx.rawTransaction)
        expect(tx.nonce).toEqual(toNumber(ledgerNonce))
    })

    test("Transactions are signed with increasing nonces", async () => {
        const transfers = getSampleTranfers(instance.getAddress(), 0.00001)
        const signedTxs = await instance.prepareTransfers(transfers)

        // INFO: I couldn't find how to recover the raw tx using web3js
        const txs = signedTxs.map(tx => Transaction.from(tx.rawTransaction))
        const nonces_sorted = verifyNumberOrder(txs, "nonce")

        expect(nonces_sorted).toBe(true)
    })

    test("Reading balance", async () => {
        const balance = await instance.getBalance(instance.getAddress())
        console.log("Balance: ", balance)
        expect(typeof parseInt(balance)).toBe("number")
    })

    test("Sending a transaction using the TEN xm sdk", async () => {
        const localInstance = await TENLOCAL.create(rpc_url)
        const signedTx = await instance.prepareTransfer(
            instance.getAddress(),
            "0.0001",
        )

        console.log("txhash: ", signedTx.transactionHash)
        const res = await localInstance.sendTransaction(signedTx.rawTransaction)
        console.log("Transaction result: ", res)
    })

    test("Sending a tx using web3js", async () => {
        const rpc_url = chainProviders.ten.testnet
        const privateKey = "0x" + wallets["ten"].privateKey

        const web3 = new Web3(rpc_url)
        const wallet = web3.eth.accounts.privateKeyToAccount(privateKey)

        const nonce = await web3.eth.getTransactionCount(wallet.address)
        console.log("nonce: ", nonce)

        const feeData = await web3.eth.calculateFeeData()
        const signedTx = await wallet.signTransaction({
            from: wallet.address,
            to: "0x4298A9D2A573dA64102255d11d6908b7e3d89b02",
            value: toNumber(toWei("0.0001", "ether")),
            gasLimit: 21000,
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
            // nonce: 2,
            // chainId: 443,
        })

        console.log("signedTx: ", signedTx)

        try {
            const res = await web3.eth.sendSignedTransaction(
                signedTx.rawTransaction,
            )
            console.log(res)
        } catch (error) {
            console.log(error)
        }
    }, 20000000)
})
