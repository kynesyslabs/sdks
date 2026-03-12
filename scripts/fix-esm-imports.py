#!/usr/bin/env python3
"""Post-build script to add .js extensions to relative imports in ESM output."""

import os
import re
import sys

BUILD_DIR = sys.argv[1] if len(sys.argv) > 1 else "build"

pattern = re.compile(r'(from\s+")(\.\.?/[^"]+?)(")')

def fix_import(match, file_dir):
    prefix = match.group(1)
    import_path = match.group(2)
    suffix = match.group(3)

    # Already has .js extension
    if import_path.endswith(".js"):
        return match.group(0)

    resolved = os.path.normpath(os.path.join(file_dir, import_path))

    # If it's a directory, append /index.js
    if os.path.isdir(resolved):
        return f'{prefix}{import_path}/index.js{suffix}'

    # Otherwise append .js
    return f'{prefix}{import_path}.js{suffix}'

count = 0
for root, dirs, files in os.walk(BUILD_DIR):
    for f in files:
        if not f.endswith(".js"):
            continue
        path = os.path.join(root, f)
        with open(path, "r") as fh:
            content = fh.read()
        new_content = pattern.sub(lambda m: fix_import(m, root), content)
        if new_content != content:
            with open(path, "w") as fh:
                fh.write(new_content)
            count += 1

print(f"fix-esm-imports: patched {count} file(s)")
