#!/bin/bash
# Run with bash scripts/test-publish-cli.sh; release commands are shell stubs.
set -eu
script=$(cd "$(dirname "$0")/.." && pwd)/publish-cli.sh

node() {
    case "$1" in
        -p) printf '1.2.3\n' ;;
        -e) printf 'STUB version write\n' >&2; return "$write_status" ;;
        *) return 99 ;;
    esac
}
git() {
    case "$1" in
        rev-parse) printf 'main\n' ;;
        *) printf 'STUB git %s\n' "$*" >&2 ;;
    esac
}
gh() { printf '0\n'; }
npm() { [[ "$*" == 'run build' ]]; }

# Run in a fresh Bash, not in an if-condition that suppresses errexit.
export -f git gh node npm
export write_status=42
status=0
output=$(BASH_ENV=/dev/null /bin/bash "$script" --bump patch --yes </dev/null 2>&1) || status=$?
if [[ $status != 42 || $output != *'STUB version write'* || $output == *'Version bumped'* || $output == *'STUB git '* ]]; then
    printf 'Failed write: expected exit 42 before staging; got %s\n%s\n' "$status" "$output" >&2
    exit 1
fi

write_status=0
output=$(BASH_ENV=/dev/null /bin/bash "$script" --bump patch --yes </dev/null 2>&1)
if [[ $output != *'STUB version write'* || $output != *'STUB git commit -m release v1.2.4'* || $output != *'STUB git push origin main'* ]]; then
    printf 'Successful bump did not finish as expected:\n%s\n' "$output" >&2
    exit 1
fi
printf 'PASS: failed write stops release; successful bump retains release message\n'
