#!/bin/sh
set -eu

root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
tmp=$(mktemp -d "$root/.test-prepack.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/pkg" "$tmp/out"
# Exercise the real manifest and lifecycle scripts without touching a developer's build.
cp "$root/package.json" "$tmp/pkg/"
cp -R "$root/scripts" "$tmp/pkg/"
cd "$tmp/pkg"

pack() {
    npm pack --offline --silent --foreground-scripts --ignore-scripts=false --pack-destination "$tmp/out"
}

reject_pack() {
    if pack >"$tmp/log" 2>&1; then
        printf 'FAIL: npm pack succeeded without %s\n' "$1" >&2
        exit 1
    fi
    grep -Fq "$1" "$tmp/log" || { cat "$tmp/log" >&2; exit 1; }
    test -z "$(ls -A "$tmp/out")"
}

reject_pack build/index.js
mkdir build
targets='build/index.js build/index.d.ts build/index.node.js build/index.node.d.ts'
for file in $targets; do printf 'export {};\n' >"$file"; done
for file in $targets; do
    mv "$file" "$tmp/held"
    reject_pack "$file"
    mv "$tmp/held" "$file"
done

# Required files must survive nested npm ignore rules, but other files need not.
printf 'index*\nomit.js\n' >build/.npmignore
touch build/omit.js
pack >/dev/null
tar -tzf "$tmp/out/"*.tgz >"$tmp/contents"
for file in $targets; do
    grep -Fxq "package/$file" "$tmp/contents" || { printf 'FAIL: archive lacks %s\n' "$file" >&2; exit 1; }
done
if grep -Fxq 'package/scripts/check-root-entrypoints.mjs' "$tmp/contents"; then printf 'FAIL: the dev-only prepack check was packed\n' >&2; exit 1; fi
if grep -Fxq 'package/build/omit.js' "$tmp/contents"; then exit 1; fi
rm "$tmp/out/"*.tgz build/.npmignore
mv build/index.node.js "$tmp/held"
mv "$tmp/held" build/Index.node.js
reject_pack build/index.node.js
printf 'PASS: missing or mis-cased roots rejected; all four exact paths archived despite nested ignores\n'
