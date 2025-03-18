import * as bitcoin from "bitcoinjs-lib"
import ECPairFactory from "ecpair"
import * as ecc from "tiny-secp256k1"
import { Buffer } from "buffer"

const ECPair = ECPairFactory(ecc)

export function generateBitcoinTestnetKey(): {
    privateKey: string
    address: string
} {
    const network = bitcoin.networks.testnet
    const keyPair = ECPair.makeRandom({ network })
    const privateKey = keyPair.toWIF()

    const { address } = bitcoin.payments.p2pkh({
        pubkey: Buffer.from(keyPair.publicKey),
        network,
    })

    return { privateKey, address: address! }
}
