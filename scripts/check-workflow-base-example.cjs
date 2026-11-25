// Run from the repository root. Type-check the guide without loading the SDK.
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")

const guide = fs.readFileSync("documentation/workflow/sdk-api.md", "utf8")
const section = guide.split("### Base Operation\n")[1].split("\n### ")[0]
const examples = [...section.matchAll(/```ts\n([\s\S]*?)```/g)]
    .flatMap(match => match[1].split("// OR"))
if (examples.length !== 2) throw new Error("Expected two Base Operation alternatives")

const file = path.resolve("workflow-example.ts")
const source = `import { BaseOperation, WorkStep, DemosWorkOperation } from './src/demoswork';
declare const xmStep: WorkStep, web2Step: WorkStep, someOperation: DemosWorkOperation;
${examples.map(example => `{\n${example}\n}`).join("\n")}`
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile)
const { options } = ts.convertCompilerOptionsFromJson(config.config.compilerOptions, process.cwd())
const host = ts.createCompilerHost(options)
const read = host.readFile
host.readFile = name => name === file ? source : read(name)
const program = ts.createProgram([file], options, host)
const example = program.getSourceFile(file)
if (!example) throw new Error("Example not loaded")
const errors = [...program.getSyntacticDiagnostics(example), ...program.getSemanticDiagnostics(example)]
for (const error of errors) console.error(`TS${error.code}: ${ts.flattenDiagnosticMessageText(error.messageText, "\n")}`)
if (errors.length) process.exit(1)
console.log("Both Base Operation examples type-check")
