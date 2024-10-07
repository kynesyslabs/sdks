/* LICENSE

© 2023 by KyneSys Labs, licensed under CC BY-NC-ND 4.0

Full license text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
Human readable license: https://creativecommons.org/licenses/by-nc-nd/4.0/

KyneSys Labs: https://www.kynesys.xyz/

*/

import { pki } from "node-forge"
import { EncryptedTransaction } from "@/types/blockchain/encryptedTransaction"
import { IPeer } from "@/types/peers/Peer"

export interface BlockContent {
    ordered_transactions: string[]
    encrypted_transactions: EncryptedTransaction[] // REVIEW This should work already as it is not enforced in the database as a field
    per_address_transactions: Map<string, string[]>
    web2data: {} // TODO Add Web2 class
    previousHash: string
    timestamp: number,

    peerlist: IPeer[]
}

export interface Block {
    number: number
    hash: string
    content: BlockContent
    status: "derived" | "confirmed"
    proposer: pki.PublicKey | pki.ed25519.BinaryBuffer
    validation_data: any
}