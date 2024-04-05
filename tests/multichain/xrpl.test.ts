import { decode } from 'xrpl'
import { XRPL } from '@demos/mx-core'
import { xrplGetLastSequence } from '@demos/mx-core'

import { getSampleTranfers, verifyNumberOrder } from '../utils'
import { wallets } from '../utils/wallets'
import chainProviders from './chainProviders'

describe('XRPL CHAIN TESTS', () => {
    const instance = new XRPL(chainProviders.xrpl.testnet)

    beforeAll(async () => {
		// with_reconnect is set to false
		// to avoid open handles when exiting
        const connected = await instance.connect(false)
        expect(connected).toBe(true)
    })

    afterAll(async () => {
        // INFO: Disconnect from the websocket to exit tests without open handles
        const disconnected = await instance.disconnect()
        expect(disconnected).toBe(true)
    })

    test('preparePay returns a signed transaction', async () => {
        await instance.connectWallet(wallets.xrpl.wallet)
        const address = instance.getAddress()

        const signed_tx = await instance.preparePay(address, '1')

        // INFO: Reconstruct the transaction from the signed payload
        // LINK: https://js.xrpl.org/functions/decode.html
        const tx = decode(signed_tx.tx_blob)

        expect(tx.TxnSignature).toBeDefined()
    })

    test('A tx is signed with the ledger nonce', async () => {
        const address = instance.getAddress()
        const ledgerNonce = await xrplGetLastSequence(
            instance.provider,
            address
        )

        const signed_tx = await instance.preparePay(address, '1')
        const tx = decode(signed_tx.tx_blob)

        expect(tx['Sequence']).toEqual(ledgerNonce)
    })

    test('Transactions are signed with increasing nonces', async () => {
        const address = instance.getAddress()
        const transfers = getSampleTranfers(address)

        const signed_txs = await instance.preparePays(transfers)
        const txs = signed_txs.map((tx) => decode(tx.tx_blob))

        const nonces_sorted = verifyNumberOrder(txs, 'Sequence')
        expect(nonces_sorted).toBe(true)
    })

    test('Transactions are signed in order of appearance', async () => {
        const address = instance.getAddress()
        const transfers = getSampleTranfers(address)

        const signed_txs = await instance.preparePays(transfers)
        const txs = signed_txs.map((tx) => decode(tx.tx_blob))

        const nonces_sorted = verifyNumberOrder(txs, 'Amount')
        expect(nonces_sorted).toBe(true)
    })
})
