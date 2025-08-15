/* LICENSE

© 2023 by KyneSys Labs, licensed under CC BY-NC-ND 4.0

Full license text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
Human readable license: https://creativecommons.org/licenses/by-nc-nd/4.0/

KyneSys Labs: https://www.kynesys.xyz/

*/

import { pki } from "node-forge"
import { EncryptedTransaction } from "./encryptedTransaction"
import { IPeer } from "../peers/Peer"

// ? This will be probably improved for performance reasons
export interface NativeTablesHashes {
    native_gcr: string
    native_subnets_txs: string
}

export interface BlockContent {
    ordered_transactions: string[]
    per_address_transactions: Map<string, string[]>
    web2data: {} // TODO Add Web2 class
    previousHash: string
    timestamp: number
    peerlist: IPeer[]
    // SECTION L2PS
    // REVIEW This should work already as it is not enforced in the database as a field
    l2ps_partecipating_nodes: Map<string, Map<string, string>> // ? "l2ps_uid": {"public_key": "connection_string"}
    l2ps_banned_nodes: Map<string, string> // ? "l2ps_uid": "public_key" (to implement)
    encrypted_transactions_hashes: Map<string, string> // ? "l2ps_uid": "hash"

    // SECTION Native tables
    native_tables_hashes: NativeTablesHashes
}

// Partecipating nodes to the L2PS will have the full transactions (encrypted) of the L2PS
export interface L2PSBlockExtension extends BlockContent {
    l2ps_transactions: EncryptedTransaction[]
}

export interface Block {
    id: number
    number: number
    hash: string
    content: BlockContent
    status: "derived" | "confirmed"
    proposer: pki.PublicKey | pki.ed25519.BinaryBuffer
    next_proposer?: pki.PublicKey | pki.ed25519.BinaryBuffer
    validation_data: any
}
