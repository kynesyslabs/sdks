/* LICENSE

© 2023 by KyneSys Labs, licensed under CC BY-NC-ND 4.0

Full license text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
Human readable license: https://creativecommons.org/licenses/by-nc-nd/4.0/

KyneSys Labs: https://www.kynesys.xyz/

*/

import * as crypto from "crypto"
import * as path from "path"
import forge from "node-forge"

// Helper to dynamically import fs (Node.js only) - avoids bundling fs for browser builds
const getFs = async () => (await import("fs")).promises

import * as bip39 from "@scure/bip39"
import { HexToForge } from "@/utils/dataManipulation"
import { Hashing } from "./Hashing"

const algorithm = "aes-256-cbc"

export class Cryptography {
    /**
     * Validates and sanitizes file paths to prevent path traversal attacks
     * @param filePath The file path to validate
     * @returns The sanitized absolute path
     * @throws Error if the path contains dangerous characters or patterns
     */
    private static validateFilePath(filePath: string): string {
        // Check for null bytes which can be used in path injection attacks
        if (filePath.includes('\0')) {
            throw new Error('Invalid file path: null byte detected')
        }

        const safeBaseDir = path.resolve(process.cwd())
        const resolvedPath = path.resolve(safeBaseDir, filePath)

        // Verify the resolved path is within the safe base directory
        if (!resolvedPath.startsWith(safeBaseDir + path.sep) && resolvedPath !== safeBaseDir) {
            throw new Error('Path traversal attempt detected. Access is restricted.')
        }

        return resolvedPath
    }
    static new() {
        const seed = forge.random.getBytesSync(32)
        const keys = forge.pki.ed25519.generateKeyPair({ seed })
        return keys
    }

    // INFO Method to generate a new key pair from a seed
    /**
     * Creates a new keypair from a mnemonic
     * @param seed White-space separated string of words
     * @returns A new keypair
     */
    static newFromSeed(seed: string | Buffer | Uint8Array) {
        if (typeof seed === "string") {
            seed = bip39.mnemonicToSeedSync(seed)
        }

        const stringSeed = seed.toString()
        const hashedSeed = Hashing.sha256(stringSeed)
        const bufferSeed = Buffer.from(hashedSeed, "hex")

        return forge.pki.ed25519.generateKeyPair({ seed: bufferSeed })
    }

    // TODO Eliminate the old legacy compatibility
    static async save(keypair: forge.pki.KeyPair, path: string, mode = "hex") {
        const fs = await getFs()
        if (mode === "hex") {
            let hexPrivKey = Cryptography.saveToHex(keypair.privateKey)
            await fs.writeFile(path, hexPrivKey)
        } else {
            await fs.writeFile(path, JSON.stringify(keypair.privateKey))
        }
    }

    static saveToHex(forgeBuffer: forge.pki.PrivateKey): string {
        //console.log(forgeBuffer) // REVIEW if it is like this
        let stringBuffer = forgeBuffer.toString("hex")
        return "0x" + stringBuffer
    }

    // SECTION Encrypted save and load
    static async saveEncrypted(
        keypair: forge.pki.KeyPair,
        path: string,
        password: string,
    ) {
        const fs = await getFs()
        const key = crypto.createCipher(algorithm, password)
        // Getting the private key in hex form
        const hex_key = keypair.privateKey.toString("hex")
        // Encrypting and saving
        const encryptedMessage = key.update(hex_key, "utf8", "hex")
        await fs.writeFile(path, encryptedMessage)
    }

    static async loadEncrypted(path: string, password: string) {
        const fs = await getFs()
        let keypair: forge.pki.KeyPair = {
            privateKey: null,
            publicKey: null,
        }
        // Validate and sanitize the file path to prevent path traversal attacks
        const safePath = Cryptography.validateFilePath(path)

        // Preparing the environment
        const decipher = crypto.createDecipher(algorithm, password)
        const contentOfFile = await fs.readFile(safePath, "utf8")
        // Decrypting
        const decryptedKey = decipher.update(contentOfFile, "hex", "utf8")
        // Loading
        if (decryptedKey.includes("{")) {
            keypair = Cryptography.loadFromBufferString(contentOfFile)
        } else {
            keypair = Cryptography.loadFromHex(contentOfFile)
        }
        return keypair
    }
    // !SECTION Encrypted save and load

    // NOTE Accepts both file paths and strings being either hex or buffer strings
    static async load(path: string, isFile = true): Promise<forge.pki.KeyPair> {
        let keypair: forge.pki.KeyPair = {
            privateKey: null,
            publicKey: null,
        }
        let content: string
        if (isFile) {
            const fs = await getFs()
            // Validate and sanitize the file path to prevent path traversal attacks
            const safePath = Cryptography.validateFilePath(path)
            content = await fs.readFile(safePath, "utf8")
        } else {
            content = path
        }
        if (content.includes("{")) {
            keypair = Cryptography.loadFromBufferString(content)
        } else {
            keypair = Cryptography.loadFromHex(content)
        }
        return keypair
    }

    static loadFromHex(content: string): forge.pki.KeyPair {
        let keypair = { publicKey: null, privateKey: null }
        content = content.slice(2)
        let finalArray = new Uint8Array(64)
        for (let i = 0; i < content.length; i += 2) {
            const hexValue = content.substr(i, 2)
            const decimalValue = parseInt(hexValue, 16)
            finalArray[i / 2] = decimalValue
        }

        keypair.privateKey = Buffer.from(finalArray)
        keypair.publicKey = forge.pki.ed25519.publicKeyFromPrivateKey({
            privateKey: keypair.privateKey,
        })
        return keypair
    }

    static loadFromBufferString(content: string): forge.pki.KeyPair {
        let keypair = { publicKey: null, privateKey: null }
        keypair.privateKey = Buffer.from(JSON.parse(content))
        keypair.publicKey = forge.pki.ed25519.publicKeyFromPrivateKey({
            privateKey: keypair.privateKey,
        })
        return keypair
    }

    static sign(
        message: string,
        privateKey: forge.pki.ed25519.BinaryBuffer | any,
    ) {
        // REVIEW Test HexToForge support
        if (privateKey.type == "string") {
            privateKey = HexToForge(privateKey)
        }

        return forge.pki.ed25519.sign({
            message,
            encoding: "utf8",
            privateKey,
        })
    }

    static verify(
        signed: string,
        signature: any | forge.pki.ed25519.BinaryBuffer,
        publicKey: any | forge.pki.ed25519.BinaryBuffer,
    ) {
        // REVIEW Test HexToForge support
        if (signature.type == "string") {
            signature = HexToForge(signature)
        }
        if (publicKey.type == "string") {
            publicKey = HexToForge(publicKey)
        }

        // Also, we have to sanitize buffers so that they are forge compatible
        if (signature.type == "Buffer") {
            signature = Buffer.from(signature) // REVIEW Does not work in bun
        }
        if (publicKey.type == "Buffer") {
            publicKey = Buffer.from(publicKey) // REVIEW Does not work in bun
        }

        return forge.pki.ed25519.verify({
            message: signed,
            encoding: "utf8",
            signature: signature,
            publicKey: publicKey,
        })
    }

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
                signature = HexToForge(signature)
            }
            if (publicKey.type == "string") {
                publicKey = HexToForge(publicKey)
            }

            // Also, we have to sanitize buffers so that they are forge compatible
            if (signature.type == "Buffer") {
                signature = Buffer.from(signature) // REVIEW Does not work in bun
            }
            if (publicKey.type == "Buffer") {
                publicKey = Buffer.from(publicKey) // REVIEW Does not work in bun
            }

            return forge.pki.ed25519.verify({
                message: signed,
                encoding: "utf8",
                signature: signature,
                publicKey: publicKey,
            })
        },
    }

    static rsa = {
        // INFO Encryption method using the public key
        encrypt: (
            message: string,
            publicKey: any | forge.pki.rsa.PublicKey,
        ): [boolean, any] => {
            // NOTE Supporting "fake buffers" from web browsers
            if (publicKey.type == "Buffer") {
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
                    privateKey = Buffer.from(privateKey)
                }
            } catch (e) {
                console.error(
                    "[DECRYPTION] Looks like there is nothing to normalize here, let's proceed\n",
                )
                console.error(e)
            }
            // Converting back the message and decrypting it
            // NOTE If no private key is provided, we try to use our one
            if (!privateKey) {
                return [false, "No private key found"]
            }
            let debased = forge.util.decode64(message)
            const decrypted = privateKey.decrypt(debased)
            return [true, decrypted.toString()]
        },
    }
}
