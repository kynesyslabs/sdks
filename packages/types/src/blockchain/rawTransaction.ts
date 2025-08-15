/* LICENSE

© 2023 by KyneSys Labs, licensed under CC BY-NC-ND 4.0

Full license text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
Human readable license: https://creativecommons.org/licenses/by-nc-nd/4.0/

KyneSys Labs: https://www.kynesys.xyz/

*/

import { TransactionContent } from "./Transaction"

export interface RawTransaction {
    id: number
    blockNumber: number
    signature: string
    status: string
    hash: string
    content: NonNullable<string>
    type: TransactionContent["type"]
    from: any
    to: any
    amount: number
    nonce: number
    timestamp: number
    networkFee: number
    rpcFee: number
    additionalFee: number
    ed25519_signature: string
    from_ed25519_address: string
}
