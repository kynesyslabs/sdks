/**
 * Secret-holding SDK objects must not print or serialise their seeds and
 * private keys, and the code paths that used to log or echo them must not.
 *
 * Every secret here is generated per run. A check passes only if no encoding
 * of the secret (hex, base64, Buffer and Uint8Array renderings, the raw
 * string) shows up in the output.
 */
import { spawnSync } from "child_process"
import { randomBytes } from "crypto"
import fs from "fs"
import os from "os"
import path from "path"
import util from "util"

import bigInt from "big-integer"
import * as bip39 from "bip39"
import base58 from "bs58"
import forge from "node-forge"
import ts from "typescript"
import { Keypair } from "@solana/web3.js"
import { Wallet as EthersWallet } from "ethers"

import { Demos } from "@/websdk"
import { DemosWebAuth } from "@/websdk/DemosWebAuth"
import { RSA } from "@/websdk/rsa"
import { unifiedCrypto } from "@/encryption/unifiedCrypto"
import { Enigma } from "@/encryption/PQC/enigma"
import { Falcon } from "@/encryption/PQC/falconts"
import { mnemonicToUint8Array, wordList } from "@/encryption/PQC/falconts"
import { ZKIdentity } from "@/encryption/zK/identity/ZKIdentity"
import { Prover } from "@/encryption/zK/interactive"
import L2PS from "@/l2ps/l2ps"
import { EVM } from "@/multichain/core/evm"
import { SOLANA } from "@/multichain/core/solana"
import { APTOS } from "@/multichain/core/aptos"
import { BTC } from "@/multichain/core/btc"
import SdkWallet from "@/wallet/Wallet"

// Wallet.ts imports the passkey module, which uses import.meta and cannot be
// loaded by ts-jest's CommonJS transform. Its logging is covered below by
// running the real module in a child process.
jest.mock("../wallet/passkeys/passkeys", () => ({ PasskeyGenerator: class {} }))

type Secret = string | Uint8Array

function needles(secret: Secret): string[] {
    if (typeof secret === "string") {
        return [secret, JSON.stringify(secret).slice(1, -1)]
    }
    const bytes = Buffer.from(secret)
    const head = Array.from(bytes.subarray(0, 8))
    return [
        bytes.toString("hex"),
        bytes.toString("base64"),
        // <Buffer 0c 22 ...>
        head.map(b => b.toString(16).padStart(2, "0")).join(" "),
        // util.inspect(Uint8Array)
        head.join(", "),
        // String(Uint8Array), JSON arrays
        head.join(","),
        // JSON.stringify(Uint8Array)
        head.map((b, i) => `"${i}":${b}`).join(","),
    ]
}

function findLeak(output: string, secrets: Secret[]): string | null {
    for (const secret of secrets) {
        for (const needle of needles(secret)) {
            if (needle.length >= 8 && output.includes(needle)) {
                return needle
            }
        }
    }
    return null
}

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const

async function captureConsole<T>(
    fn: () => T | Promise<T>,
): Promise<{ result: T | undefined; error: unknown; output: string }> {
    const lines: string[] = []
    const spies = CONSOLE_METHODS.map(method =>
        jest
            .spyOn(console, method)
            .mockImplementation((...args: unknown[]) => {
                lines.push(util.format(...args))
            }),
    )
    let result: T | undefined
    let error: unknown
    try {
        result = await fn()
    } catch (e) {
        error = e
    } finally {
        spies.forEach(spy => spy.mockRestore())
    }
    const errorText =
        error instanceof Error ? `${error.message}\n${error.stack}` : String(error ?? "")
    return { result, error, output: lines.join("\n") + "\n" + errorText }
}

function renderings(obj: object): Record<string, string> {
    const out: Record<string, string> = {
        "JSON.stringify": JSON.stringify(obj),
        "JSON.stringify nested": JSON.stringify({ wrapped: obj }),
        "util.inspect": util.inspect(obj, { depth: Infinity }),
        "util.inspect showHidden": util.inspect(obj, {
            depth: Infinity,
            showHidden: true,
        }),
        "util.inspect nested": util.inspect({ wrapped: obj }, { depth: Infinity }),
        String: String(obj),
        template: `${obj}`,
        // What an error reporter that copies own enumerable keys sees.
        "object spread": util.inspect({ ...obj }, { depth: Infinity }),
        "Object.keys": Object.keys(obj).join(","),
    }
    try {
        out.structuredClone = util.inspect(structuredClone(obj), {
            depth: Infinity,
        })
    } catch {
        // Instances with function-valued fields cannot be cloned at all.
    }
    return out
}

async function expectRedacted(obj: object, secrets: Secret[]) {
    for (const s of secrets) {
        expect(s).toBeTruthy()
    }
    const { output: consoleOutput } = await captureConsole(() => {
        console.log(obj)
        console.log("%o", obj)
        console.error("wrapped", { obj })
    })
    const all = { ...renderings(obj), console: consoleOutput }
    for (const [how, text] of Object.entries(all)) {
        const leak = findLeak(text, secrets)
        if (leak) {
            throw new Error(`${how} exposed a secret (${leak.slice(0, 12)}...)`)
        }
    }
}

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex")

describe("SDK objects keep key material out of serialisation and logs", () => {
    afterEach(() => {
        for (const id of unifiedCrypto.getInstanceIds()) {
            unifiedCrypto.removeInstance(id)
        }
    })

    test("Demos after connectWallet(mnemonic)", async () => {
        const demos = new Demos()
        const mnemonic = demos.newMnemonic()
        const { output, error } = await captureConsole(() =>
            demos.connectWallet(mnemonic, { algorithm: "ml-dsa" }),
        )
        expect(error).toBeUndefined()

        const secrets: Secret[] = [
            mnemonic,
            demos.crypto.masterSeed,
            demos.crypto.ed25519KeyPair.privateKey,
            demos.crypto.enigma.ml_dsa_signing_keypair.privateKey,
            demos.keypair.privateKey as Uint8Array,
        ]
        expect(findLeak(output, secrets)).toBeNull()
        await expectRedacted(demos, secrets)
        await expectRedacted(demos.crypto, secrets)
        await expectRedacted(demos.crypto.enigma, secrets)

        // Reading by name and signing still work.
        expect(demos.walletConnected).toBe(true)
        expect(Object.keys(demos)).not.toContain("crypto")
        const signed = await demos.signMessage("key exposure spec")
        expect(signed.data).toBeTruthy()
    })

    test("UnifiedCrypto and Enigma with every PQC identity", async () => {
        const seed = new Uint8Array(randomBytes(128))
        const uc = unifiedCrypto.getInstance("key-exposure", seed)
        await uc.generateIdentity("ed25519")
        await uc.generateIdentity("falcon")
        await uc.generateIdentity("ml-dsa")
        await uc.generateIdentity("ml-kem-aes")

        const secrets: Secret[] = [
            seed,
            uc.ed25519KeyPair.privateKey,
            uc.enigma.falcon_signing_keypair.privateKey,
            uc.enigma.falcon_signing_keypair.genKey,
            uc.enigma.ml_dsa_signing_keypair.privateKey,
            uc.enigma.ml_kem_encryption_keypair.privateKey,
        ]
        await expectRedacted(uc, secrets)
        await expectRedacted(uc.enigma, secrets)
        expect(uc.masterSeed).toBe(seed)
        expect(JSON.parse(JSON.stringify(uc))).toEqual({
            instanceId: "key-exposure",
            hasMasterSeed: true,
        })
    })

    test("standalone Enigma and Falcon", async () => {
        const enigma = new Enigma()
        await enigma.generate_ml_dsa_signing_keypair(new Uint8Array(randomBytes(32)))
        await enigma.generate_ml_kem_encryption_keypair(new Uint8Array(randomBytes(64)))
        await expectRedacted(enigma, [
            enigma.ml_dsa_signing_keypair.privateKey,
            enigma.ml_kem_encryption_keypair.privateKey,
        ])

        const falcon = new Falcon()
        await falcon.init()
        await falcon.genkey(new Uint8Array(randomBytes(48)))
        const sk = await falcon.getPrivateKey()
        await expectRedacted(falcon, [sk])
    })

    test("DemosWebAuth and RSA", async () => {
        const auth = new DemosWebAuth()
        const [ok, keypair] = await auth.create()
        expect(ok).toBe(true)
        // The documented return value still carries the key.
        expect(keypair.privateKey).toBe(auth.keypair.privateKey)
        await expectRedacted(auth, [
            auth.keypair.privateKey as Uint8Array,
            auth.stringified_keypair.privateKey,
        ])

        const rsa = new RSA()
        rsa.keypair = forge.pki.rsa.generateKeyPair({ bits: 512, e: 0x10001 })
        rsa.stringified_keypair = JSON.stringify(rsa.keypair)
        const d = rsa.keypair.privateKey.d.toString(16)
        expect(d.length).toBeGreaterThan(16)
        await expectRedacted(rsa, [d, rsa.stringified_keypair])
    })

    test("wallet.Wallet", async () => {
        const wallet = SdkWallet.getInstance("key-exposure-spec")
        await wallet.create()
        expect(wallet.ed25519_hex.privateKey).toMatch(/^0x[0-9a-f]+$/)
        await expectRedacted(wallet, [
            wallet.ed25519_hex.privateKey.slice(2),
            wallet.ed25519.privateKey as unknown as Uint8Array,
        ])
    })

    test("L2PS key and IV", async () => {
        const key = randomBytes(16).toString("hex")
        const iv = randomBytes(6).toString("hex")
        const l2ps = await L2PS.create(key, iv)
        await expectRedacted(l2ps, [key, iv])
        await expectRedacted(L2PS.getInstances(), [key, iv])
    })

    test("ZKIdentity and the interactive Prover", async () => {
        const identity = new ZKIdentity("github:key-exposure")
        const secret = identity.export().secret
        expect(secret.length).toBeGreaterThan(16)
        await expectRedacted(identity, [secret])

        const big = () => bigInt(randomBytes(16).toString("hex"), 16)
        const proverSecret = big()
        const prover = new Prover(big(), big(), proverSecret)
        prover.generateCommitment()
        const nonce = (prover as any).randomValue.toString()
        await expectRedacted(prover, [proverSecret.toString(), nonce])
    })

    test("XM chain wallets: EVM, Solana, Aptos, BTC", async () => {
        const evmKey = EthersWallet.createRandom().privateKey
        const evm = new EVM("", 1)
        await captureConsole(() => evm.connectWallet(evmKey))
        await expectRedacted(evm, [evmKey.slice(2)])

        const solKeypair = Keypair.generate()
        const solKey = base58.encode(solKeypair.secretKey)
        const sol = new SOLANA("")
        await sol.connectWallet(solKey)
        await expectRedacted(sol, [solKey, solKeypair.secretKey])

        const aptosKey = "0x" + randomBytes(32).toString("hex")
        const aptos = new APTOS("")
        const { output: aptosLogs } = await captureConsole(() =>
            aptos.connectWallet(aptosKey),
        )
        expect(findLeak(aptosLogs, [aptosKey.slice(2)])).toBeNull()
        await expectRedacted(aptos, [aptosKey.slice(2)])

        const btcMnemonic = bip39.generateMnemonic()
        const btc = new BTC("")
        await btc.connectWallet(btcMnemonic)
        await expectRedacted(btc, [
            btcMnemonic,
            btc.wallet.privateKey as Uint8Array,
        ])
    })
})

describe("code paths that used to log or echo secrets", () => {
    test("EVM.getContractInstance no longer logs the instance", async () => {
        const key = EthersWallet.createRandom().privateKey
        const evm = new EVM("", 1)
        await captureConsole(() => evm.connectWallet(key))
        const { output, error } = await captureConsole(() =>
            evm.getContractInstance(
                "0x0000000000000000000000000000000000000001",
                "[]",
            ),
        )
        expect(error).toBeInstanceOf(Error)
        expect(findLeak(output, [key.slice(2)])).toBeNull()
    })

    test("Falcon mnemonic error names the position, not the word", () => {
        const bad = "zz" + randomBytes(6).toString("hex")
        const words = wordList.slice(0, 12)
        words[4] = bad
        let message = ""
        try {
            mnemonicToUint8Array(words.join(" "))
        } catch (e) {
            message = (e as Error).message
        }
        expect(message).toContain("word 5")
        expect(message).not.toContain(bad)
    })

    test("PasskeyGenerator.generate does not log the private key", () => {
        // Run the real module in Node: ts-jest's CommonJS output cannot load
        // it. A stub generate.sh writes the key where the module reads it.
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "passkey-spec-"))
        try {
            const source = fs.readFileSync(
                path.join(__dirname, "../wallet/passkeys/passkeys.ts"),
                "utf8",
            )
            const js = ts.transpileModule(source, {
                compilerOptions: {
                    module: ts.ModuleKind.ESNext,
                    target: ts.ScriptTarget.ES2020,
                },
            }).outputText
            fs.writeFileSync(path.join(dir, "passkeys.mjs"), js)
            fs.mkdirSync(path.join(dir, "hmywallet"))
            fs.writeFileSync(
                path.join(dir, "hmywallet", "generate.sh"),
                '#!/bin/bash\nmkdir -p hmywallet\nprintf "%s" "$PASSKEY_SPEC_KEY" > hmywallet/private_key.txt\n',
            )
            fs.writeFileSync(
                path.join(dir, "run.mjs"),
                [
                    'import { PasskeyGenerator } from "./passkeys.mjs"',
                    "const key = await new PasskeyGenerator().generate()",
                    'console.log(key === process.env.PASSKEY_SPEC_KEY ? "RESULT:match" : "RESULT:mismatch")',
                ].join("\n"),
            )

            const key = randomBytes(32).toString("hex")
            const run = spawnSync(process.execPath, ["run.mjs"], {
                cwd: dir,
                env: { ...process.env, PASSKEY_SPEC_KEY: key },
                encoding: "utf8",
            })
            const output = `${run.stdout}\n${run.stderr}`
            expect(output).toContain("RESULT:match")
            expect(findLeak(output, [key])).toBeNull()
        } finally {
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })
})
