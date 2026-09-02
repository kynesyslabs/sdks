import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const packageRoot = new URL("../", import.meta.url);
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, "npm_execpath is required");

function npm(args, cwd = packageRoot) {
  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url)));
const forbidden = [
  /^@aptos-labs\//,
  /^@cosmjs\//,
  /^@solana\//,
  /^@metaplex-foundation\//,
  /^@multiversx\//,
  /^@ton\//,
  /^near-api-js$/,
  /^tronweb$/,
  /^xrpl$/,
  /^rubic-sdk$/,
  /^tlsn-js$/,
];
for (const [location, metadata] of Object.entries(lock.packages ?? {})) {
  const name = metadata.name ?? location.split("node_modules/").at(-1) ?? "";
  assert.ok(
    !forbidden.some((pattern) => pattern.test(name)),
    `forbidden dependency ${name} at ${location}`,
  );
  for (const value of Object.values(metadata.dependencies ?? {})) {
    assert.doesNotMatch(
      String(value),
      /^(?:git\+|git:|github:|https?:\/\/github\.com\/)/,
      `Git dependency at ${location}`,
    );
  }
}

const audit = JSON.parse(npm(["audit", "--omit=dev", "--json"]));
assert.equal(audit.metadata.vulnerabilities.total, 0, "production audit must be clean");

for (const args of [
  ["sbom", "--omit=dev", "--sbom-format", "cyclonedx"],
  ["sbom", "--package-lock-only", "--omit=dev", "--sbom-format", "cyclonedx"],
]) {
  const sbom = JSON.parse(npm(args));
  assert.equal(sbom.bomFormat, "CycloneDX");
  assert.ok(Array.isArray(sbom.components));
}

const packDirectory = mkdtempSync(join(tmpdir(), "demos-native-pack-"));
const packed = JSON.parse(npm([
  "pack",
  "--json",
  "--pack-destination",
  packDirectory,
]));
assert.equal(packed.length, 1);
const entry = packed[0];
for (const file of entry.files) {
  assert.doesNotMatch(file.path, /(?:^|\/)(?:src|test|scripts|node_modules)(?:\/|$)/);
  assert.doesNotMatch(file.path, /\.map$/);
}

const consumer = mkdtempSync(join(tmpdir(), "demos-native-consumer-"));
writeFileSync(join(consumer, "package.json"), JSON.stringify({
  name: "demos-native-release-consumer",
  private: true,
  type: "module",
}));
npm([
  "install",
  "--engine-strict",
  "--ignore-scripts",
  join(packDirectory, entry.filename),
], consumer);
const consumerAudit = JSON.parse(npm(["audit", "--omit=dev", "--json"], consumer));
assert.equal(consumerAudit.metadata.vulnerabilities.total, 0);
const smokeModule = join(consumer, "smoke.mjs");
writeFileSync(smokeModule, [
  'import { Demos, StorageProgram } from "@kynesyslabs/demos-native";',
  'import { verifyCanonicalChannelMessage } from "@kynesyslabs/demos-native/channel-codec";',
  'import { L2PSMessagingPeer } from "@kynesyslabs/demos-native/messaging";',
  "export { Demos, StorageProgram, L2PSMessagingPeer, verifyCanonicalChannelMessage };",
].join("\n"));
const installed = await import(smokeModule);
assert.equal(typeof installed.Demos, "function");
assert.equal(typeof installed.StorageProgram, "function");
assert.equal(typeof installed.L2PSMessagingPeer, "function");
assert.equal(typeof installed.verifyCanonicalChannelMessage, "function");

process.stdout.write(JSON.stringify({
  schema: "demos-native-release-verification/v1",
  package: entry.id,
  tarballFiles: entry.entryCount,
  tarballBytes: entry.size,
  unpackedBytes: entry.unpackedSize,
  productionAuditFindings: 0,
  cleanConsumer: true,
  engineStrict: true,
  physicalSbom: true,
  lockSbom: true,
  dependencyDeny: true,
}) + "\n");
