import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function verifyConsumerSboms(npm) {
  // npm ls lists the consumer first; only installed dependencies are components.
  const paths = npm(["ls", "--all", "--omit=dev", "--parseable"]).trimEnd().split(/\r?\n/);
  const installed = paths.slice(1).map((path) => {
    const { name, version } = JSON.parse(readFileSync(join(path, "package.json")));
    return `${name}@${version}`;
  });
  for (const lockOnly of [false, true]) {
    const sbom = JSON.parse(npm([
      "sbom", `--package-lock-only=${lockOnly}`, "--omit=dev", "--sbom-format", "cyclonedx",
    ]));
    assert.equal(sbom.bomFormat, "CycloneDX");
    const components = new Set(sbom.components.map(({ group, name, version }) =>
      `${group ? `${group}/` : ""}${name}@${version}`));
    const missing = installed.filter((id) => !components.has(id));
    assert.ok(!missing.length, `${lockOnly ? "lock" : "physical"} SBOM missing: ${missing.join(", ")}`);
  }
}
