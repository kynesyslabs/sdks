"""Type-check the guide's message examples without loading the SDK at runtime."""
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory

root = Path(__file__).resolve().parents[1]
guide = (sys.stdin.read() if sys.argv[1:] == ['-'] else
         (root / 'documentation/multichain/egld.md').read_text())


def example(section):
    match = re.search(rf'^## {section}\n\n```ts\n(.*?)\n```$', guide, re.M | re.S)
    assert match, f'Missing example: {section}'
    return match[1]


with TemporaryDirectory(dir=root) as folder:
    fixture = Path(folder) / 'example.ts'
    fixture.write_text('''import type { MULTIVERSX } from '../src/multichain/websdk/index'
async function example(instance: MULTIVERSX, message: string, walletAddress: string) {
''' + example('Signing a message') + '\n' + example('Verifying a message') + '''
    return [signature, verified] satisfies [string, boolean]
}
''')
    (Path(folder) / 'tsconfig.json').write_text('''{"files":["example.ts"],"compilerOptions":{
        "noEmit":true,"skipLibCheck":true,"target":"esnext","module":"esnext",
        "moduleResolution":"bundler","paths":{"@/*":["../src/*"]}}}''')
    result = subprocess.run(['tsc', '-p', '.', '--pretty', 'false'], cwd=folder,
                            capture_output=True, text=True)
    # The offline checkout need not have the SDK's third-party dependencies.
    # Report fixture and compiler errors, not diagnostics in imported SDK files.
    errors = [line for line in result.stdout.splitlines()
              if line.startswith((fixture.name, 'error TS'))]
    if errors or result.stderr or (result.returncode and not result.stdout):
        raise SystemExit('\n'.join(errors) or result.stderr or 'tsc failed')
    print('EGLD message examples type-check')
