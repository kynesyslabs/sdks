import forge from 'node-forge'

import { demos } from './demos'
import { sha256 } from './utils/sha256'
import * as skeletons from './utils/skeletons'
import { DemosWebAuth } from './DemosWebAuth'

import type { ValidityData, Transaction } from '@/types'

export const DemosTransactions = {
  // REVIEW All this part
  // NOTE A courtesy to get a skeleton of transactions
  empty: function () {
    return skeletons.transaction
  },
  // NOTE Building a transaction without signing or hashing it
  prepare: async function (data: any) {
    // sourcery skip: inline-immediately-returned-variable
    const thisTx = skeletons.transaction
    // if (!data.timestamp) data.timestamp = Date.now()
    // Assigning the transaction data to our object
    // thisTx.content = data
    return thisTx
  },
  // NOTE Signing a transaction after hashing it
  sign: async function (raw_tx: Transaction, private_key: Uint8Array | null = null): Promise<Transaction> {
    // If necessary, the private key is loaded from the state
    if (!private_key) {
      const id = DemosWebAuth.getInstance().keypair
      private_key = id!.privateKey as Uint8Array
      console.log('Private key loaded from state')
    } else {
      console.log('Private key provided')
    }
    console.log(private_key)
    // Setting the public key
    raw_tx.content.from = DemosWebAuth.getInstance().keypair!.publicKey as Uint8Array
    // Hashing the content of the transaction
    raw_tx.hash = await sha256(JSON.stringify(raw_tx.content))
    // Signing the hash of the content
    let signatureData = forge.pki.ed25519.sign({
      message: raw_tx.hash,
      encoding: 'utf8',
      privateKey: private_key
    }) // REVIEW if it is working right
    raw_tx.signature = {
      type: 'ed25519',
      data: signatureData
    }
    // TODO Remove debug: error checking
    let verified = forge.pki.ed25519.verify({
      message: raw_tx.hash,
      encoding: 'utf8',
      signature: signatureData,
      publicKey: DemosWebAuth.getInstance().keypair!.publicKey as Uint8Array
    })
    console.log('Signature verified: ' + verified)

    return raw_tx // Hashed and signed
  },
  // NOTE Sending a transaction after signing it
  confirm: async function (signedPayload: Transaction) {
    let response = await demos.confirm(signedPayload);
    response = JSON.parse(response);
    return response;
  },
  broadcast: async function (validityData: ValidityData) {
    // ValidityData does not need to be signed as it already contains a signature (in the Transaction object)
    // and is sent as a ComLink (thus authenticated and signed by the sender)
    let response = await demos.broadcast(validityData);
    response = JSON.parse(response);
    return response;
  },
}
