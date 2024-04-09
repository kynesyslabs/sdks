import { Address } from '@multiversx/sdk-core'

import { MULTIVERSX } from '@/multichain/core'
import { getSampleTranfers, verifyNumberOrder } from '../utils'
import { wallets } from '../utils/wallets'
import chainProviders from './chainProviders'

describe('EGLD CHAIN TESTS', () => {
    let instance: MULTIVERSX

    beforeAll(async () => {
        instance = await MULTIVERSX.create(chainProviders.egld.testnet)
        const connected = await instance.connect()
        expect(connected).toBe(true)
    })

    test('preparePay returns a signed transaction', async () => {
        await instance.connectWallet(wallets.egld.wallet, {
            password: wallets.egld.password,
        })
        const tx = await instance.preparePay(instance.getAddress(), '0.00001')

        // INFO: Signature should be a 128 bit string
        expect(tx.signature?.length).toEqual(128)
    })

    test('Transcation is signed with the ledger nonce', async () => {
        const address = new Address(instance.getAddress())
        // INFO: Get the user's account on the network
        const accountOnNetwork = await instance.provider.getAccount(address)
        const ledgerNonce = accountOnNetwork.nonce

        const tx = await instance.preparePay(instance.getAddress(), '0.00001')

        expect(tx.nonce).toEqual(ledgerNonce)
    })

    test('Transactions are signed with increasing nonces', async () => {
        const address = instance.getAddress()
        const txs = await instance.preparePays(getSampleTranfers(address))

        const is_sorted = verifyNumberOrder(txs, 'nonce')

        // INFO: Nonces should be sorted in ascending order
        expect(is_sorted).toBe(true)
    })

    test('Transactions are signed in order of appearance', async () => {
        const address = instance.getAddress()
        const txs = await instance.preparePays(getSampleTranfers(address))

        const is_sorted = verifyNumberOrder(txs, 'value')

        // INFO: Amounts should be sorted in ascending order
        expect(is_sorted).toEqual(true)
    })
})
