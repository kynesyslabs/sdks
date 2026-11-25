// Run with node scripts/check-multichain-guide.cjs. Compile the guide; never run it.
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");

const guide = readFileSync(resolve(__dirname, "../documentation/multichain/README.md"), "utf8");
// The first block illustrates alternative imports (with ellipses), not consumer code.
const blocks = Array.from(guide.matchAll(/^```ts\r?\n([\s\S]*?)^```/gm), match => match[1]).slice(1);
const example = resolve(__dirname, "multichain-guide.ts");
const signingTypes = resolve(__dirname, "signing-fixture.d.ts");
const sources = new Map([
  [example, `import { EVM } from "../src/multichain/core/evm";
declare function assert(condition: boolean): void;
async function example(rpc_url: string, privateKey: string): Promise<[boolean, string, string[]]> {
${blocks.join("\n")}
return [instance.connected, signedTx, signedTxs];
}`],
  // Only the external signer boundary is needed to infer the SDK's payload types.
  [signingTypes, `declare module "ethers" {
    export class Wallet { address: string; signTransaction(tx: unknown): Promise<string>; }
  }`],
]);
const options = { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, types: [], noEmit: true };
const host = ts.createCompilerHost(options);
const read = host.readFile;
host.readFile = path => sources.get(path) ?? read(path);
const program = ts.createProgram([...sources.keys()], options, host);
const consumer = program.getSourceFile(example);
// Check the consumer, not unrelated SDK methods and their third-party dependencies.
const errors = [...program.getSyntacticDiagnostics(consumer), ...program.getSemanticDiagnostics(consumer)]
  .map(d => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);

// TS permits discarding a promise (notably connectWallet) as a standalone statement.
const checker = program.getTypeChecker();
function checkStatement(node) {
  if (ts.isExpressionStatement(node) && checker.getTypeAtLocation(node.expression).getProperty("then")) {
    errors.push(`Unawaited promise: ${node.expression.getText(consumer)}`);
  }
  ts.forEachChild(node, checkStatement);
}
checkStatement(consumer);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Multichain guide type-check passed (no example executed).");
}
