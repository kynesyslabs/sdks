import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import { join, relative } from "path"

/**
 * Guards the pull request check that runs the offline specs
 * (.github/workflows/test.offline.yml, jest.offline.config.ts).
 */
const ROOT = join(__dirname, "..", "..")
const WORKFLOW = join(ROOT, ".github", "workflows", "test.offline.yml")

const { NETWORKED_SPECS, default: offlineConfig } = require("../../jest.offline.config")

function specFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === "build") continue
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) {
            out.push(...specFiles(path))
        } else if (/\.(spec|test)\.ts$/.test(entry)) {
            out.push(path)
        }
    }
    return out
}

/** The specs the offline config would run, as repo-relative paths. */
function offlineSpecs(): string[] {
    const ignored = (offlineConfig.testPathIgnorePatterns as string[]).map(
        pattern => new RegExp(pattern.replace("<rootDir>", ROOT)),
    )
    return [...specFiles(join(ROOT, "src")), ...specFiles(join(ROOT, "tests"))]
        .filter(path => !ignored.some(pattern => pattern.test(path)))
        .map(path => relative(ROOT, path))
}

describe("the offline specs gate pull requests", () => {
    const workflow = readFileSync(WORKFLOW, "utf8")

    it("runs on every pull request to main, with no path filter", () => {
        expect(workflow).toMatch(/^on:\n {2}pull_request:\n {4}branches:\n {6}- main\n/m)
        expect(workflow).not.toMatch(/^\s*paths(-ignore)?:/m)
    })

    it("can only read the repository", () => {
        expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m)
        expect(workflow).not.toMatch(/write/)
    })

    it("pins every action by commit and installs the locked bun 1.4.4", () => {
        const uses = [...workflow.matchAll(/^\s*- uses: (\S+)/gm)].map(match => match[1])
        expect(uses.length).toBeGreaterThan(0)
        for (const action of uses) expect(action).toMatch(/@[0-9a-f]{40}$/)
        expect(workflow).toMatch(/bun-version: '1\.4\.4'/)
        expect(workflow).toMatch(/bun install .*--frozen-lockfile/)
    })

    it("runs the script that uses the offline config", () => {
        const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts
        expect(workflow).toMatch(/run: bun run test:offline$/m)
        expect(scripts["test:offline"]).toContain("--config jest.offline.config.ts")
    })
})

describe("the offline spec selection", () => {
    it("lists only specs that exist", () => {
        const missing = (NETWORKED_SPECS as string[]).filter(path => !existsSync(join(ROOT, path)))
        expect(missing).toEqual([])
    })

    it("does not list a spec twice", () => {
        expect(new Set(NETWORKED_SPECS).size).toBe(NETWORKED_SPECS.length)
    })

    it("includes specs, and this one", () => {
        const included = offlineSpecs()
        expect(included.length).toBeGreaterThan(30)
        expect(included).toContain("src/tests/offlineSuite.spec.ts")
        for (const path of NETWORKED_SPECS) expect(included).not.toContain(path)
    })

    it("makes process.exit in a spec a failure instead of a silent green run", () => {
        expect(offlineConfig.setupFiles).toEqual(["<rootDir>/jest.offline.setup.ts"])

        const realExit = process.exit
        process.exit = jest.fn() as never
        try {
            jest.isolateModules(() => {
                require("../../jest.offline.setup")
            })
            expect(() => process.exit(0)).toThrow(/process\.exit\(0\) was called by a spec/)
        } finally {
            process.exit = realExit
        }
    })
})
