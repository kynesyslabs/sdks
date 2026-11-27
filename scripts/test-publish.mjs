import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const publish = fileURLToPath(new URL("../publish", import.meta.url))
// Source the real helper with only shell builtins and these in-memory fixtures.
// In particular, the version update cannot write the checkout's package.json.
const fixture = `
    node() { printf '%s\\n' '1.2.3'; }
    gh() { printf '%s\\n' '0'; }
    bun() { return 0; }
    git() {
        if [[ $1 == rev-parse ]]; then printf '%s\\n' main; return; fi
        printf '%s\\n' "$1" >&2
        [[ $1 != "$FAIL" ]] || return 42
    }
    source "$PUBLISH"
`

for (const mode of ["new", "redo"]) {
    const steps = mode === "new" ? ["add", "commit", "push"] : ["commit", "push"]
    for (const fail of [...steps, "none"]) {
        test(`${mode}: ${fail === "none" ? "success" : `${fail} fails`}`, () => {
            const redo = mode === "redo"
            const run = spawnSync("/bin/bash", ["-c", fixture, publish, ...(redo ? ["--redo"] : [])], {
                encoding: "utf8",
                env: { PATH: "/dev/null", PUBLISH: publish, FAIL: fail },
                input: redo ? "y" : "1y",
            })
            if (run.error) throw run.error
            const success = fail === "none"
            assert.deepEqual({
                status: run.status,
                calls: run.stderr.trim().split("\n"),
                committed: /✓ (Created empty commit|Committed version bump)/.test(run.stdout),
                pushed: run.stdout.includes("Pushed to remote"),
                workflow: run.stdout.includes("Release workflow should start shortly"),
            }, {
                status: success ? 0 : 42,
                calls: success ? steps : steps.slice(0, steps.indexOf(fail) + 1),
                committed: success || fail === "push",
                pushed: success,
                workflow: success,
            })
        })
    }
}
