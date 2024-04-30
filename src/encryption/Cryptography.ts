/* LICENSE

© 2023 by KyneSys Labs, licensed under CC BY-NC-ND 4.0

Full license text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
Human readable license: https://creativecommons.org/licenses/by-nc-nd/4.0/

KyneSys Labs: https://www.kynesys.xyz/

*/

import * as crypto from "crypto"
import { promises as fs } from "fs"
import forge from "node-forge"

import { HexToForge } from "@/utils/dataManipulation"


const algorithm = "aes-256-cbc"

export default class Cryptography {

    static ed25519 = {
        sign: (
            message: string,
            privateKey: forge.pki.ed25519.BinaryBuffer | any,
        ) => {
            // REVIEW Test HexToForge support
            if (privateKey.type == "string") {
                console.log("[HexToForge] Deriving a buffer from privateKey...")
                privateKey = HexToForge(privateKey)
            }

            return forge.pki.ed25519.sign({
                message,
                encoding: "utf8",
                privateKey,
            })
        },

        verify: (
            signed: string,
            signature: any | forge.pki.ed25519.BinaryBuffer,
            publicKey: any | forge.pki.ed25519.BinaryBuffer,
        ) => {
            // REVIEW Test HexToForge support
            if (signature.type == "string") {
                console.log("[HexToForge] Deriving a buffer from signature...")
                signature = HexToForge(signature)
            }
            if (publicKey.type == "string") {
                console.log("[HexToForge] Deriving a buffer from publicKey...")
                publicKey = HexToForge(publicKey)
            }

            // Also, we have to sanitize buffers so that they are forge compatible
            if (signature.type == "Buffer") {
                console.log("[*] Normalizing signature...")
                console.log(typeof signature)
                signature = Buffer.from(signature) // REVIEW Does not work in bun
            }
            if (publicKey.type == "Buffer") {
                console.log("[*] Normalizing publicKey...")
                publicKey = Buffer.from(publicKey) // REVIEW Does not work in bun
            }

            console.log("[*] Verifying the signature of: " + signed + "\n")
            console.log("[*] Using the signature: ")
            console.log(signature)
            console.log("[*] And the public key: ")
            console.log(publicKey)
            return forge.pki.ed25519.verify({
                message: signed,
                encoding: "utf8",
                signature: signature,
                publicKey: publicKey,
            })
        }
    }

    static rsa = {
        // INFO Encryption method using the public key
        encrypt: (
            message: string,
            publicKey: any | forge.pki.rsa.PublicKey,
        ): [boolean, any] => {
            // NOTE Supporting "fake buffers" from web browsers
            if (publicKey.type == "Buffer") {
                console.log("[ENCRYPTION] Normalizing publicKey...")
                publicKey = Buffer.from(publicKey)
            }
            // Converting the message and decrypting it
            let based = forge.util.encode64(message)
            const encrypted = publicKey.encrypt(based)
            return [true, encrypted]
        },

        // INFO Decryption method using the private key
        decrypt: (
            message: string,
            privateKey: any | forge.pki.rsa.PrivateKey = null,
        ): [boolean, any] => {
            // NOTE Supporting "fake buffers" from web browsers
            try {
                if (privateKey.type == "Buffer") {
                    console.log("[DECRYPTION] Normalizing privateKey...\n")
                    privateKey = Buffer.from(privateKey)
                }
            } catch (e) {
                console.log(
                    "[DECRYPTION] Looks like there is nothing to normalize here, let's proceed\n",
                )
                console.log(e)
            }
            // Converting back the message and decrypting it
            // NOTE If no private key is provided, we try to use our one
            if (!privateKey) {
                console.log(
                    "[DECRYPTION] No private key provided!\n",
                )
                return [false, "No private key found"]
            }
            let debased = forge.util.decode64(message)
            const decrypted = privateKey.decrypt(debased)
            return [true, decrypted.toString()]
        },
    }
}
