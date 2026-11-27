// Type-check the guide's initialization block without executing it or contacting the RPC.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const guide = fs.readFileSync(path.join(root, 'documentation/multichain/near.md'), 'utf8');
const block = guide.match(/^### Initialization\n(?:(?!^### )[\s\S])*?^```ts\n([\s\S]*?)^```/m);
assert.ok(block, 'Missing initialization example');
const fixture = path.join(root, 'near-guide-example.ts');
const options = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    paths: { '@kynesyslabs/demosdk/xm-websdk': [path.join(root, 'src/multichain/websdk/index.ts')] },
};
const host = ts.createCompilerHost(options);
const read = host.readFile;
host.readFile = file => file === fixture ? block[1] : read(file);
const program = ts.createProgram([fixture], options, host);
const file = program.getSourceFile(fixture);
assert.ok(file);
const errors = [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)];
for (const error of errors) console.error(`TS${error.code}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`);
if (errors.length) process.exit(1);
console.log('NEAR initialization example type-checks');
