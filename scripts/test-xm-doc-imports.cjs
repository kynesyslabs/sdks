// After building the SDK: node scripts/test-xm-doc-imports.cjs
const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const path = require("node:path")
const ts = require("typescript")

const root = path.resolve(__dirname, "..")
const examples = new Map()
for (const doc of ["README.md", "documentation/demoswork/cookbook.md"]) {
    const markdown = readFileSync(path.join(root, doc), "utf8")
    const before = examples.size
    for (const match of markdown.matchAll(/^```(?:ts|typescript)\r?\n([\s\S]*?)^```/gm)) {
        const body = match[1]
        if (!/\bprepareXM(?:Payload|Script)\b/.test(body)) continue
        const line = markdown.slice(0, match.index).split("\n").length
        const file = path.join(root, `${doc}-${line}.mts`)
        const source = ts.createSourceFile(file, body, ts.ScriptTarget.Latest)
        const imports = source.statements.filter(ts.isImportDeclaration)
        assert.ok(imports.length, `No imports in ${doc}:${line}`)
        examples.set(file, imports.map(statement => statement.getText(source)).join("\n"))
    }
    assert.ok(examples.size > before, `No XM examples found in ${doc}`)
}

// Virtual ESM consumers use the real package self-reference and built declarations.
// Only their import declarations are compiled; no SDK code is loaded.
const options = {
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    verbatimModuleSyntax: true,
    strict: true, skipLibCheck: true, noEmit: true, types: [], rootDir: root,
}
const host = ts.createCompilerHost(options)
const readFile = host.readFile
host.readFile = file => examples.get(file) ?? readFile(file)
const program = ts.createProgram([...examples.keys()], options, host)
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length) {
    process.stderr.write(ts.formatDiagnostics(diagnostics, host))
    process.exitCode = 1
} else {
    console.log(`Type-checked XM imports in ${examples.size} documentation examples`)
}
