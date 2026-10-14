import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repositoryRoot = new URL("../", import.meta.url);
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, "npm_execpath is required");

function npm(args, cwd = repositoryRoot) {
  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
assert.equal(
  manifest.exports["./instant-messaging"],
  "./build/instant_messaging/index.js",
);
assert.equal(manifest.exports["."].node.default, "./build/index.node.js");
assert.equal(manifest.dependencies["tweetnacl-util"], "^0.15.1");
assert.equal(manifest.dependencies["@near-js/utils"], "0.3.0");

for (const relative of [
  "build/index.js",
  "build/index.d.ts",
  "build/index.node.js",
  "build/index.node.d.ts",
  "build/instant_messaging/index.js",
  "build/instant_messaging/index.d.ts",
]) {
  assert.doesNotThrow(
    () => readFileSync(new URL(`../${relative}`, import.meta.url)),
    `${relative} must exist before packed-consumer verification`,
  );
}

const packDirectory = mkdtempSync(join(tmpdir(), "demosdk-messaging-pack-"));
const [packed] = JSON.parse(npm([
  "pack",
  "--json",
  "--pack-destination",
  packDirectory,
]));
assert.ok(packed?.filename);

const consumer = mkdtempSync(join(tmpdir(), "demosdk-messaging-consumer-"));
writeFileSync(join(consumer, "package.json"), JSON.stringify({
  name: "demosdk-messaging-clean-consumer",
  private: true,
  type: "module",
}));
npm([
  "install",
  "--ignore-scripts",
  join(packDirectory, packed.filename),
], consumer);

const smoke = join(consumer, "smoke.mjs");
writeFileSync(smoke, [
  'import * as root from "@kynesyslabs/demosdk";',
  'import { L2PSMessagingPeer } from "@kynesyslabs/demosdk/instant-messaging";',
  'if (typeof root.instantMessaging?.L2PSMessagingPeer !== "function") throw new Error("root messaging export unavailable");',
  'if (typeof L2PSMessagingPeer !== "function") throw new Error("messaging export unavailable");',
].join("\n"));
execFileSync(process.execPath, [smoke], { cwd: consumer, stdio: "inherit" });

process.stdout.write(JSON.stringify({
  schema: "demosdk-messaging-packed-consumer/v1",
  package: packed.id,
  rootImport: true,
  messagingImport: true,
}) + "\n");
