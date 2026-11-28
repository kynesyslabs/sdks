// Run from the repository root with TypeScript on the Node module path.
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")

const markdown = fs.readFileSync("documentation/demoswork/cookbook.md", "utf8")
const [, example] = /^## Combining conditions\n\n```ts\n([\s\S]*?)\n```/m.exec(markdown)
const file = path.resolve("cookbook-conditions.fixture.ts")
const source = 'import { Condition } from "./src/demoswork"\n' + example
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile)
const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd())
const host = ts.createCompilerHost(options)
const read = host.readFile.bind(host)
host.readFile = name => name === file ? source : read(name)
const program = ts.createProgram([file], options, host)
const fixture = program.getSourceFile(file)
const diagnostics = [...program.getSyntacticDiagnostics(fixture), ...program.getSemanticDiagnostics(fixture)]
for (const diagnostic of diagnostics) {
    console.error(`TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`)
}
process.exitCode = diagnostics.length ? 1 : 0
