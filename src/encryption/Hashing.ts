/* LICENSE

© 2023 by KyneSys Labs, licensed under CC BY-NC-ND 4.0

Full license text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
Human readable license: https://creativecommons.org/licenses/by-nc-nd/4.0/

KyneSys Labs: https://www.kynesys.xyz/

*/

import forge from "node-forge"
import { sha3_256, sha3_512 } from "@noble/hashes/sha3"
import { bytesToHex } from "@noble/hashes/utils"

export class Hashing {
    /**
     * SHA-256 of a string, as hex.
     *
     * Text is hashed as its UTF-8 bytes, matching node stabilisation since
     * dcbee323 (`createHash().update(string)`). Only `"raw"` passes the string to
     * forge unchanged, exactly as before; it is a byte encoding only for char
     * codes ≤ 0xFF. Use it for forge binary strings and consensus values that
     * must preserve the old encoding.
     */
    static sha256(message: string, encoding: "utf8" | "raw" = "utf8") {
        if (typeof message !== "string") {
            throw new TypeError("Hashing.sha256 expects a string")
        }
        const forgeEncoding = encoding === "raw" ? "raw" : "utf8"
        if (forgeEncoding === "utf8") {
            const text = message as string & { toWellFormed?: () => string }
            message =
                typeof text.toWellFormed === "function"
                    ? text.toWellFormed()
                    : message.replace(
                          /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g,
                          (match) => (match.length === 2 ? match : "\uFFFD"),
                      )
        }
        const md = forge.sha256.create()
        md.update(message, forgeEncoding)
        return md.digest().toHex()
    }

    static sha3_256(message: Uint8Array | string): string {
        const hash = sha3_256(message)
        return bytesToHex(hash)
    }

    static sha3_512(message: Uint8Array | string) {
        return sha3_512(message)
    }
}
