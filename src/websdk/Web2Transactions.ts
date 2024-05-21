// INFO This module exposes methods to quickly send Web2 requests to the network

import * as skeletons from './utils/skeletons'
// import demos from '../demos'
import { DemosTransactions } from './DemosTransactions';
import type { IWeb2Request, Transaction } from '@/types';
import { DemosWebAuth } from './DemosWebAuth'

// INFO Web2 Endpoints
export async function prepareWeb2Payload (
  action = 'GET',
  url = 'https://icanhazip.com',
  parameters = [],
  requestedParameters = null,
  headers = null,
  minAttestations = 2
): Promise<Transaction> {
  // Generating an empty one and filling it
  const web2_payload:IWeb2Request = skeletons.web2_request
  web2_payload.raw.action = action
  web2_payload.raw.url = url
  web2_payload.raw.parameters = parameters
  web2_payload.raw.headers = headers
  web2_payload.raw.minAttestations = minAttestations
  // Ensuring content is a known property
  web2_payload.attestations = new Map()
  web2_payload.hash = ''
  web2_payload.signature = ''
  web2_payload.result = ''

  console.log('[Web2Transactions] Payload:')
  console.log(web2_payload)
  // REVIEW Finish upgrading to the new transaction system
  // Creating a web2 payload
  let web2_tx: Transaction = DemosTransactions.empty()
  // From and To are the same in Web2 transactions
  web2_tx.content.from = DemosWebAuth.getInstance().keypair!.publicKey as Uint8Array
  web2_tx.content.to = web2_tx.content.from
  // Setting the type and data
  web2_tx.content.type = "web2Request"
  web2_tx.content.data = ["web2Request", web2_payload]
  // Producing a timestamp
  web2_tx.content.timestamp = Date.now()
  // Signing the transaction
  web2_tx = await DemosTransactions.sign(web2_tx)
  // Returning the transaction
  return web2_tx
}
