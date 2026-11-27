import { execFileSync, spawnSync } from "child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { dirname, join } from "path"
import { decode } from "@jridgewell/sourcemap-codec"
import ts from "typescript"

/**
 * scripts/normalize-esm-specifiers.mjs adds ".js" / "/index.js" to relative
 * specifiers in the emitted build. It must only touch specifiers in code
 * positions: a string, comment or template text that merely looks like an
 * import is data and has to come through byte for byte.
 */
const ROOT = join(__dirname, "..", "..")

const FILES: Record<string, string> = {
    "helper.js": "export const x = 1\n",
    "dir/index.js": "export const y = 2\n",
    "leaf.js": "export const value = 3\n",
    "café.js": "export const unicode = 4\n",
    "main.js": [
        `import { x } from "./helper"`,
        `import './helper'`,
        `export { y } from './dir'`,
        `export { value } from "./le\\u0061f"`,
        `export { unicode } from "./caf\\u00e9"`,
        `export * from "./helper.js"`,
        `import { z } from "./missing"`,
        `import pkg from "some-pkg"`,
        `export const msg = "import './helper'"`,
        `export const msg2 = 'export * from "./helper"'`,
        `// import { x } from "./helper"`,
        `/* export * from './helper' */`,
        "export const tpl = `import(\"./helper\") ${x}`",
        "export const live = `${await import(\"./helper\")}`",
        `export async function lazy() { return import( "./dir/" ) }`,
        `export {}`,
        `export { x as renamed }`,
        "",
    ].join("\n"),
    "types.d.ts": [
        `import type { X } from "./helper";`,
        `export type H = typeof import("./helper");`,
        `export declare const s: "import('./helper')";`,
        `// export type C = import("./helper").X`,
        "",
    ].join("\n"),
}

const EXPECTED: Record<string, string> = {
    ...FILES,
    "main.js": FILES["main.js"]
        .replace(`import { x } from "./helper"`, `import { x } from "./helper.js"`)
        .replace(`import './helper'\n`, `import './helper.js'\n`)
        .replace(`export { y } from './dir'`, `export { y } from './dir/index.js'`)
        .replace(`export { value } from "./le\\u0061f"`, `export { value } from "./le\\u0061f.js"`)
        .replace(`export { unicode } from "./caf\\u00e9"`, `export { unicode } from "./caf\\u00e9.js"`)
        .replace("await import(\"./helper\")", "await import(\"./helper.js\")")
        .replace(`import( "./dir/" )`, `import( "./dir/index.js" )`),
    "types.d.ts": FILES["types.d.ts"]
        .replace(`import type { X } from "./helper";`, `import type { X } from "./helper.js";`)
        .replace(`typeof import("./helper");`, `typeof import("./helper.js");`),
}

function runNormalizer(files: Record<string, string>) {
    const workspace = mkdtempSync(join(tmpdir(), "normalize-esm-"))
    try {
        mkdirSync(join(workspace, "scripts"))
        copyFileSync(
            join(ROOT, "scripts", "normalize-esm-specifiers.mjs"),
            join(workspace, "scripts", "normalize-esm-specifiers.mjs"),
        )
        symlinkSync(join(ROOT, "node_modules"), join(workspace, "node_modules"), "dir")
        for (const [name, text] of Object.entries(files)) {
            mkdirSync(dirname(join(workspace, "build", name)), { recursive: true })
            writeFileSync(join(workspace, "build", name), text)
        }
        const run = () =>
            execFileSync(process.execPath, [join(workspace, "scripts", "normalize-esm-specifiers.mjs")], {
                encoding: "utf8",
            }).trim()
        const first = run()
        const after = Object.fromEntries(
            Object.keys(files).map(name => [name, readFileSync(join(workspace, "build", name), "utf8")]),
        )
        const second = run()
        const afterSecond = Object.fromEntries(
            Object.keys(files).map(name => [name, readFileSync(join(workspace, "build", name), "utf8")]),
        )
        return { first, second, after, afterSecond }
    } finally {
        rmSync(workspace, { recursive: true, force: true })
    }
}

describe("normalize-esm-specifiers", () => {
    it("rewrites only specifiers in code positions", () => {
        const { first, after } = runNormalizer(FILES)
        expect(after).toEqual(EXPECTED)
        expect(first).toBe("Normalized 9 relative ESM specifiers in 2 build files\nShifted 0 source maps")
    })

    it("leaves a string that looks like an import alone", () => {
        const { first, after } = runNormalizer({
            "helper.js": "export const x = 1\n",
            "main.js": `import { x } from "./helper"\nexport const msg = "import './helper'"\n`,
        })
        expect(after["main.js"]).toBe(`import { x } from "./helper.js"\nexport const msg = "import './helper'"\n`)
        expect(first).toBe("Normalized 1 relative ESM specifiers in 1 build files\nShifted 0 source maps")
    })

    it("changes nothing on a second run", () => {
        const { second, after, afterSecond } = runNormalizer(FILES)
        expect(afterSecond).toEqual(after)
        expect(second).toBe("Normalized 0 relative ESM specifiers in 0 build files\nShifted 0 source maps")
    })

    // tsc's own output is the oracle: compile the source once as written
    // ("./helper") and once with the specifiers already resolved
    // ("./helper.js"). After normalizing, the first build must equal the
    // second in text, and its map must carry the second build's generated
    // columns with the first build's original positions.
    function emit(text: string, eol = "\n") {
        const newLine = eol === "\r\n" ? ts.NewLineKind.CarriageReturnLineFeed : ts.NewLineKind.LineFeed
        const out = ts.transpileModule(text, {
            fileName: "main.ts",
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, sourceMap: true, newLine },
        })
        return { js: out.outputText, map: out.sourceMapText as string }
    }

    it.each([
        ["LF", "\n"],
        ["CRLF", "\r\n"],
    ])("keeps the source map aligned (%s, non-ASCII before the import)", (_name, eol) => {
        const lines = (helper: string, dir: string) => [
            `import { x } from "${helper}"; export const a = x`,
            `const e = "été €"; export const lazy = () => import("${dir}").then(m => m)`,
            `export const msg = "import './helper'"; export { x as y } from "${helper}"; export const z = 1`,
            "",
        ].join(eol)
        const plain = emit(lines("./helper", "./dir"), eol)
        const resolved = emit(lines("./helper.js", "./dir/index.js"), eol)
        expect(plain.js.includes("\r\n")).toBe(eol === "\r\n")
        const { after } = runNormalizer({
            "helper.js": "export const x = 1\n",
            "dir/index.js": "export const y = 2\n",
            "main.js": plain.js,
            "main.js.map": plain.map,
        })
        expect(after["main.js"]).toBe(resolved.js)
        const got = decode(JSON.parse(after["main.js.map"]).mappings)
        const want = decode(JSON.parse(resolved.map).mappings)
        const orig = decode(JSON.parse(plain.map).mappings)
        expect(got.map(line => line.map(s => s[0]))).toEqual(want.map(line => line.map(s => s[0])))
        expect(got.map(line => line.map(s => s.slice(1)))).toEqual(orig.map(line => line.map(s => s.slice(1))))
        expect(JSON.parse(after["main.js.map"]).mappings).not.toBe(JSON.parse(plain.map).mappings)
    })

    it("keeps CRLF and non-ASCII declarations byte for byte apart from the specifier", () => {
        const dts = `import type { X } from "./helper";\r\nimport type { Value } from "./le\\u0061f";\r\n// é — "./helper"\r\nexport declare const s: "import('./helper') ✓";\r\nexport type H = typeof import("./helper");\r\nexport {};\r\n`
        const { after, afterSecond } = runNormalizer({
            "helper.js": "export const x = 1\n",
            "leaf.js": "export const value = 1\n",
            "types.d.ts": dts,
        })
        expect(after["types.d.ts"]).toBe(
            dts.replace(`from "./helper";`, `from "./helper.js";`)
                .replace(`from "./le\\u0061f";`, `from "./le\\u0061f.js";`)
                .replace(`import("./helper");`, `import("./helper.js");`),
        )
        expect(afterSecond).toEqual(after)
    })

    it("normalizes a real TypeScript escaped import for Node without changing its raw escape", () => {
        const workspace = mkdtempSync(join(tmpdir(), "normalize-esm-consumer-"))
        try {
            mkdirSync(join(workspace, "scripts"))
            mkdirSync(join(workspace, "src"))
            copyFileSync(
                join(ROOT, "scripts", "normalize-esm-specifiers.mjs"),
                join(workspace, "scripts", "normalize-esm-specifiers.mjs"),
            )
            symlinkSync(join(ROOT, "node_modules"), join(workspace, "node_modules"), "dir")
            writeFileSync(join(workspace, "src", "index.ts"), `export { value } from "./le\\u0061f";\n`)
            writeFileSync(join(workspace, "src", "leaf.ts"), `export const value = "works";\n`)
            execFileSync(process.execPath, [
                join(workspace, "node_modules", "typescript", "bin", "tsc"),
                "--target", "ES2022", "--module", "ES2022", "--moduleResolution", "bundler",
                "--skipLibCheck", "--sourceMap", "--outDir", "build", "src/index.ts", "src/leaf.ts",
            ], { cwd: workspace, encoding: "utf8" })
            const emitted = readFileSync(join(workspace, "build", "index.js"), "utf8")
            expect(emitted).toContain(`"./le\\u0061f"`)
            execFileSync(process.execPath, [join(workspace, "scripts", "normalize-esm-specifiers.mjs")], {
                cwd: workspace,
                encoding: "utf8",
            })
            const normalized = readFileSync(join(workspace, "build", "index.js"), "utf8")
            expect(normalized).toContain(`"./le\\u0061f.js"`)
            const consumer = execFileSync(process.execPath, [
                "--input-type=module", "-e",
                `import { value } from "./build/index.js"; process.stdout.write(value)`,
            ], { cwd: workspace, encoding: "utf8" })
            expect(consumer).toBe("works")
        } finally {
            rmSync(workspace, { recursive: true, force: true })
        }
    })

    it("preserves escaped specifier spelling and later same-line source-map columns", () => {
        const plain = emit(`import { value } from "./le\\u0061f"; export const after = value\n`)
        const { after } = runNormalizer({
            "leaf.js": `export const value = "ok"\n`,
            "main.js": plain.js,
            "main.js.map": plain.map,
        })
        expect(after["main.js"]).toContain(`"./le\\u0061f.js"`)
        const got = decode(JSON.parse(after["main.js.map"]).mappings)
        const want = decode(JSON.parse(emit(`import { value } from "./le\\u0061f.js"; export const after = value\n`).map).mappings)
        const orig = decode(JSON.parse(plain.map).mappings)
        expect(got.map(line => line.map(s => s[0]))).toEqual(want.map(line => line.map(s => s[0])))
        expect(got.map(line => line.map(s => s.slice(1)))).toEqual(orig.map(line => line.map(s => s.slice(1))))
    })

    it("does not touch a map a second run", () => {
        const plain = emit(`import { x } from "./helper"; export const a = x\n`)
        const { after, afterSecond, second } = runNormalizer({
            "helper.js": "export const x = 1\n",
            "main.js": plain.js,
            "main.js.map": plain.map,
        })
        expect(after["main.js.map"]).not.toBe(plain.map)
        expect(afterSecond).toEqual(after)
        expect(second).toBe("Normalized 0 relative ESM specifiers in 0 build files\nShifted 0 source maps")
    })

    // Fresh tsc output always has a sibling map and a matching last-line
    // sourceMappingURL, and tsc stops the build before this script on a
    // syntax error. Anything else means the build is not what the script
    // assumes, so it must refuse and leave every file as it was.
    function runRefusal(files: Record<string, string>) {
        const workspace = mkdtempSync(join(tmpdir(), "normalize-esm-"))
        try {
            mkdirSync(join(workspace, "scripts"))
            copyFileSync(
                join(ROOT, "scripts", "normalize-esm-specifiers.mjs"),
                join(workspace, "scripts", "normalize-esm-specifiers.mjs"),
            )
            symlinkSync(join(ROOT, "node_modules"), join(workspace, "node_modules"), "dir")
            for (const [name, text] of Object.entries(files)) {
                mkdirSync(dirname(join(workspace, "build", name)), { recursive: true })
                writeFileSync(join(workspace, "build", name), text)
            }
            const run = spawnSync(process.execPath, [join(workspace, "scripts", "normalize-esm-specifiers.mjs")], {
                encoding: "utf8",
            })
            const after = Object.fromEntries(
                Object.keys(files).map(name => [name, readFileSync(join(workspace, "build", name), "utf8")]),
            )
            return { status: run.status, stderr: run.stderr, after }
        } finally {
            rmSync(workspace, { recursive: true, force: true })
        }
    }

    const mapped = emit(`import { x } from "./helper"; export const a = x\n`)
    const helperFile = { "helper.js": "export const x = 1\n", "ok.js": `import "./helper"\n` }
    it.each([
        ["sourceMappingURL without its map", { "main.js": mapped.js }, /main\.js\.map is missing/],
        ["a map without sourceMappingURL", { "main.js": mapped.js.replace(/\/\/# sourceMappingURL=.*$/, ""), "main.js.map": mapped.map }, /found none/],
        ["an inline source map", { "main.js": mapped.js.replace(/\/\/# sourceMappingURL=.*$/, "//# sourceMappingURL=data:application/json;base64,AA==") }, /expected sourceMappingURL=main\.js\.map, found data:/],
        ["sourceMappingURL naming another map", { "main.js": mapped.js.replace("main.js.map", "other.js.map"), "main.js.map": mapped.map, "other.js.map": mapped.map }, /found other\.js\.map/],
        ["a map that is not JSON", { "main.js": mapped.js, "main.js.map": "{" }, /not valid JSON/],
        ["a file that does not parse", { "main.js": `import { x } from "./helper"\nexport const = ;\n` }, /main\.js:2: cannot parse/],
    ])("refuses %s and writes nothing", (_name, files, message) => {
        const input = { ...helperFile, ...files } as Record<string, string>
        const { status, stderr, after } = runRefusal(input)
        expect(status).not.toBe(0)
        expect(stderr).toMatch(message)
        expect(after).toEqual(input)
    })

    it("leaves files that need no rewrite alone even if they do not parse or have no map", () => {
        const input = { ...helperFile, "broken.js": "export const = ;\n", "vendored.js": "x()\n//# sourceMappingURL=vendored.js.map\n" }
        const { status, after } = runRefusal(input)
        expect(status).toBe(0)
        expect(after).toEqual({ ...input, "ok.js": `import "./helper.js"\n` })
    })
})
