/* LICENSE

© 2023 by KyneSys Labs, licensed under CC BY-NC-ND 4.0

Full license text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
Human readable license: https://creativecommons.org/licenses/by-nc-nd/4.0/

KyneSys Labs: https://www.kynesys.xyz/

*/

import forge from "node-forge"
import { sha3_512 } from "@noble/hashes/sha3"

export class Hashing {
    static sha256(message: string) {
        const md = forge.sha256.create()
        md.update(message)
        return md.digest().toHex()
    }

    static sha3_512(message: Uint8Array | string) {
        return sha3_512(message)
    }
}
