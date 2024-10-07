/* LICENSE

© 2023 by KyneSys Labs, licensed under CC BY-NC-ND 4.0

Full license text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
Human readable license: https://creativecommons.org/licenses/by-nc-nd/4.0/

KyneSys Labs: https://www.kynesys.xyz/

*/

import { Socket } from "socket.io-client"

export interface IPeerConfig {
    connectionString?: string
    socket?: Socket
    identity?: string
}


export interface IPeer {
    // connection informations
    connection: {
        string: string // this is optional and is mostly used for permanent connections
    }
    identity: string // public key
    // verification informations
    verification: {
        status: boolean // has been verified against the public key
        message: string // message from the peer at the time of verification
        timestamp: number // timestamp of the verification
    }
    // sync informations // TODO Implement
    sync: {
        status: boolean // is the peer synced to our last block
        block: number // the last block number we know the peer is synced to
        block_hash: string // the hash of the last block we know the peer is synced to
    }
    // status informations
    status: {
        online: boolean // is the peer online
        timestamp: number // timestamp of the last online status check
        ready: boolean // is the peer ready to be used (aka 1. synced, 2. verified, 3. online, 4. not in an error state)  // TODO Implement
    }
}