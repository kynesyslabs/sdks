import { Cryptography, Hashing, uint8ArrayToHex } from "@/encryption"
import { Demos, demos, DemosWebAuth } from "@/websdk"
import { mnemonicToSeedSync } from "@scure/bip39"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import ts from "typescript"

// Public BIP39 test phrase. Never use this wallet for funds.
const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
const address = "0x263af3be8487729727d99b35dcfdc61bf920a9164249ad117b292e6d3c7194f8"
const seedAddress = "0xd354410dfe09779096f679ba68ecbf0e73f45af9b363192edff052667b63bcaa"
const legacyAddress = "0x5004eb74216d55d439dda09f29c7611c59c426dad03d4b99e35a1b839cdff421"
const legacyBufferAddress = "0x90721022644444dd2d3b7bbc0df87fa8ef1838e2c83aa9ec40a64a41d48382d2"
const legacyCreateThenConnectAddress = "0x6512ecf5d8ce1b07eb6886f302c2a2d58bc09f5c5c4905b50cde6a8796ce5bae"

describe("mnemonic restoration compatibility (#171)", () => {
    test("unseeded create does not warn", async () => {
        const originalWarn = console.warn
        const warnings: unknown[][] = []
        console.warn = (...args) => { warnings.push(args) }
        try {
            const auth = new DemosWebAuth()
            expect((await auth.create())[0]).toBe(true)
            expect(warnings).toEqual([])
        } finally {
            console.warn = originalWarn
        }
    })

    test("one phrase has one address across supported wallet entry points, without warnings", async () => {
        const wallet = new Demos()
        const originalConnect = Demos.prototype.connect
        const originalWarn = console.warn
        const warnings: string[] = []
        const urls: string[] = []
        console.warn = (...args) => { warnings.push(args.join(" ")) }
        // start() delegates wallet restoration; no node or transaction is needed.
        Demos.prototype.connect = async function (url: string) {
            urls.push(url)
            this.connected = true
            return true
        }
        try {
            expect(await wallet.connectWallet(mnemonic)).toBe(address)
            expect(wallet.getAddress()).toBe(address)
            expect(await wallet.getEd25519Address()).toBe(address)
            expect(uint8ArrayToHex(wallet.keypair.publicKey)).toBe(address)
            expect(await wallet.connectWallet(`  ${mnemonic}  `)).toBe(address)
            expect(await demos.connectWallet(mnemonic)).toBe(address)

            expect(await wallet.start("http://unused.invalid", mnemonic)).toBe(wallet)
            expect(wallet.getAddress()).toBe(address)
            const started = await Demos.start("http://unused.invalid", mnemonic)
            expect(started).toBe(demos)
            expect(started.getAddress()).toBe(address)
            expect(urls).toEqual(["http://unused.invalid", "http://unused.invalid"])

            // PQC signing must preserve the same accompanying ed25519 identity.
            for (const algorithm of ["falcon", "ml-dsa"] as const) {
                await wallet.connectWallet(mnemonic, { algorithm })
                expect(await wallet.getEd25519Address()).toBe(address)
            }
            expect(warnings).toEqual([])
        } finally {
            Demos.prototype.connect = originalConnect
            console.warn = originalWarn
            wallet.disconnect()
            demos.disconnect()
        }
    })

    test("legacy paths keep their pinned addresses and warn once per derivation across instances", async () => {
        const wallet = new Demos()
        const otherWallet = new Demos()
        const seed = mnemonicToSeedSync(mnemonic)
        const seedCopy = new Uint8Array(seed)
        const originalWarn = console.warn
        const warnings: string[] = []
        console.warn = (...args) => { warnings.push(args.join(" ")) }
        try {
            // Neither a prehashed mnemonic nor a 32-byte private key is a
            // BIP39 seed-byte restoration. Both must remain warning-free.
            const masterSeed = new TextEncoder().encode(
                uint8ArrayToHex(Hashing.sha3_512(mnemonic)).slice(2),
            )
            expect(await wallet.connectWallet(masterSeed)).toBe(address)
            expect(await wallet.connectWalletFromPrivateKey("11".repeat(32))).toMatch(/^0x[0-9a-f]{64}$/)
            expect(warnings).toEqual([])

            expect(await wallet.connectWallet(seed)).toBe(seedAddress)
            expect(await otherWallet.connectWallet(Buffer.from(seed))).toBe(seedAddress)
            const byteWarnings = warnings.length

            // The existing 128-byte prehashed-master-seed path also stays intact.
            expect(await wallet.connectWallet(masterSeed)).toBe(address)
            const prehashedWarnings = warnings.length

            expect(uint8ArrayToHex(DemosWebAuth.keyPairFromMnemonic(mnemonic).publicKey)).toBe(legacyAddress)
            const legacyWarnings = warnings.length
            expect(uint8ArrayToHex(DemosWebAuth.keyPairFromMnemonic(seed).publicKey)).toBe(legacyAddress)
            // Buffer.toString() differs from Uint8Array.toString(); preserve both.
            expect(uint8ArrayToHex(DemosWebAuth.keyPairFromMnemonic(Buffer.from(seed)).publicKey)).toBe(legacyBufferAddress)
            expect(uint8ArrayToHex(Cryptography.newFromSeed(mnemonic).publicKey)).toBe(legacyAddress)
            expect(uint8ArrayToHex(Cryptography.newFromSeed(seed).publicKey)).toBe(legacyAddress)
            expect(uint8ArrayToHex(Cryptography.newFromSeed(Buffer.from(seed)).publicKey)).toBe(legacyBufferAddress)
            const auth = new DemosWebAuth()
            expect((await auth.create(mnemonic))[0]).toBe(true)
            expect(uint8ArrayToHex(auth.keypair.publicKey)).toBe(legacyAddress)
            expect(await wallet.connectWallet(auth.keypair.privateKey as Uint8Array)).toBe(legacyCreateThenConnectAddress)
            const otherAuth = new DemosWebAuth()
            await otherAuth.create(mnemonic)
            expect(uint8ArrayToHex(otherAuth.keypair.publicKey)).toBe(legacyAddress)
            // Check warning counts after exercising every compatibility vector,
            // so a run against the old implementation still verifies all keys.
            expect(byteWarnings).toBe(1)
            expect(prehashedWarnings).toBe(1)
            expect(legacyWarnings).toBe(2)
            expect(warnings).toHaveLength(2)
            expect(warnings[0]).toContain("connectWallet(Uint8Array)")
            expect(warnings[0]).toContain("BIP39 seed bytes")
            expect(warnings[0]).toContain("ed25519 secret keys")
            expect(warnings[1]).toContain("DemosWebAuth.keyPairFromMnemonic")
            for (const warning of warnings) {
                expect(warning).toContain("deprecated")
                expect(warning).toContain("Existing wallets must keep their original derivation")
                expect(warning).not.toContain(mnemonic)
                expect(warning).not.toContain(uint8ArrayToHex(seed))
            }
            expect(seed).toEqual(seedCopy)
        } finally {
            console.warn = originalWarn
            wallet.disconnect()
            otherWallet.disconnect()
        }
    })

    test("private key connection calls a subclass wallet override without a legacy warning", async () => {
        let IsolatedDemos = Demos
        jest.isolateModules(() => {
            IsolatedDemos = require("../../websdk").Demos
        })
        class TrackedDemos extends IsolatedDemos {
            seen: (string | Uint8Array)[] = []

            override async connectWallet(seed: string | Uint8Array, options?: Parameters<Demos["connectWallet"]>[1]) {
                this.seen.push(seed)
                return super.connectWallet(seed, options)
            }
        }

        const wallet = new TrackedDemos()
        const reference = new IsolatedDemos()
        const originalWarn = console.warn
        const warnings: unknown[][] = []
        console.warn = (...args) => { warnings.push(args) }
        try {
            const key = Uint8Array.from({ length: 32 }, () => 0x11)
            const expected = await reference.connectWallet(key as string | Uint8Array)
            expect(await wallet.connectWalletFromPrivateKey("11".repeat(32))).toBe(expected)
            expect(wallet.getAddress()).toBe(expected)
            expect(wallet.seen).toEqual([key])
            expect(warnings).toEqual([])
        } finally {
            console.warn = originalWarn
            wallet.disconnect()
            reference.disconnect()
        }
    })

    test("the public create overload only deprecates seeded calls", () => {
        const source = ts.createSourceFile("DemosWebAuth.ts", readFileSync(resolve(__dirname, "../../websdk/DemosWebAuth.ts"), "utf8"), ts.ScriptTarget.Latest, true)
        const authClass = source.statements.find((statement): statement is ts.ClassDeclaration => ts.isClassDeclaration(statement) && statement.name?.text === "DemosWebAuth")
        const overloads = authClass?.members.filter((member): member is ts.MethodDeclaration => ts.isMethodDeclaration(member) && member.name.getText(source) === "create" && !member.body)
        expect(overloads).toHaveLength(3)
        expect(overloads?.[0].parameters).toHaveLength(0)
        expect(ts.getJSDocDeprecatedTag(overloads![0])).toBeUndefined()
        expect(overloads?.[1].parameters).toHaveLength(1)
        expect(ts.getJSDocDeprecatedTag(overloads![1])).toBeDefined()
        expect(overloads?.[2].parameters[0].questionToken).toBeDefined()
        expect(ts.getJSDocDeprecatedTag(overloads![2])).toBeUndefined()
    })

    test("strict consumers can forward an optional seed while literal seeds remain deprecated", () => {
        const fixture = resolve(__dirname, "fixtures/createOptionalSeed.ts")
        const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json")!
        const config = ts.readConfigFile(configPath, ts.sys.readFile)
        expect(config.error).toBeUndefined()
        const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd())
        const program = ts.createProgram([fixture], {
            ...parsed.options,
            strictNullChecks: true,
            noEmit: true,
            skipLibCheck: true,
        })
        const diagnostics = ts.getPreEmitDiagnostics(program).filter(diagnostic => diagnostic.file?.fileName === fixture)
        expect(diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))).toEqual([])

        const source = program.getSourceFile(fixture)!
        const seededCall = (source.statements.find((statement): statement is ts.VariableStatement =>
            ts.isVariableStatement(statement) && statement.declarationList.declarations[0].name.getText(source) === "seeded"
        )).declarationList.declarations[0].initializer as ts.CallExpression
        const signature = program.getTypeChecker().getResolvedSignature(seededCall)
        expect(ts.getJSDocDeprecatedTag(signature!.declaration!)).toBeDefined()
    })

    test.each(["maybeSeed", "undefined"])("the optional %s fixture call is not deprecated under package settings", argument => {
        const fixture = resolve(__dirname, "fixtures/createOptionalSeed.ts")
        const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json")!
        const config = ts.readConfigFile(configPath, ts.sys.readFile)
        const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd())
        const program = ts.createProgram([fixture], { ...parsed.options, noEmit: true, skipLibCheck: true })
        const source = program.getSourceFile(fixture)!
        const calls: ts.CallExpression[] = []
        const visit = (node: ts.Node) => {
            if (ts.isCallExpression(node) && node.arguments[0]?.getText(source) === argument) calls.push(node)
            ts.forEachChild(node, visit)
        }
        visit(source)
        expect(calls).toHaveLength(1)
        const signature = program.getTypeChecker().getResolvedSignature(calls[0])
        expect(ts.getJSDocDeprecatedTag(signature!.declaration!)).toBeUndefined()
    })

    test.each(["maybeSeed", "undefined"])("the optional %s fixture promise is intentionally ignored", argument => {
        const source = ts.createSourceFile("createOptionalSeed.ts", readFileSync(resolve(__dirname, "fixtures/createOptionalSeed.ts"), "utf8"), ts.ScriptTarget.Latest, true)
        const calls: ts.CallExpression[] = []
        const visit = (node: ts.Node) => {
            if (ts.isCallExpression(node) && node.arguments[0]?.getText(source) === argument) calls.push(node)
            ts.forEachChild(node, visit)
        }
        visit(source)
        expect(calls).toHaveLength(1)
        expect(calls[0].parent?.kind).toBe(ts.SyntaxKind.VoidExpression)
    })

    test("the shipped web2 example connects with a mnemonic", () => {
        const source = ts.createSourceFile("tryWeb2.ts", readFileSync(resolve(__dirname, "../../websdk/examples/tryWeb2.ts"), "utf8"), ts.ScriptTarget.Latest, true)
        const calls: ts.CallExpression[] = []
        const visit = (node: ts.Node) => {
            if (ts.isCallExpression(node) && node.expression.getText(source) === "demos.connectWallet") calls.push(node)
            ts.forEachChild(node, visit)
        }
        visit(source)
        expect(calls).toHaveLength(1)
        expect(calls[0].arguments[0].getText(source)).toBe("demos.newMnemonic()")
    })
})
