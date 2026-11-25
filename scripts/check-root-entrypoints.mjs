import { readdirSync, readFileSync } from "node:fs"

const manifest = JSON.parse(readFileSync("package.json", "utf8"))
const root = manifest.exports["."]
// Use directory entries: stat can accept the wrong spelling on case-insensitive hosts.
const hasBuild = readdirSync(".", { withFileTypes: true }).some(
    entry => entry.name === "build" && entry.isDirectory(),
)
const files = new Set(hasBuild ? readdirSync("build", { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => `./build/${entry.name}`) : [])
for (const file of [root.default, root.types, root.node.default, root.node.types]) {
    if (!files.has(file)) {
        console.error(`Cannot pack: missing built entrypoint ${file}. Run npm run build first.`)
        process.exit(1)
    }
}
