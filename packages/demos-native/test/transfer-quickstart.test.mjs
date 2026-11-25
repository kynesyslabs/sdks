import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

// Run the documented transfer steps, without importing the SDK or opening a wallet.
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const steps = readme.match(/^const signed = await demos\.transfer\b[\s\S]*?(?=^```$)/m)?.[0];
assert.ok(steps, "expected transfer steps in the README quickstart");

for (const result of [200, 503]) {
  test(`transfer quickstart handles RPC result ${result} without resubmitting`, async (t) => {
    const demos = {
      transfer: async () => ({}),
      confirm: async () => ({}),
      broadcast: t.mock.fn(async () => ({ result, response: null })),
    };
    const completion = runInNewContext(`(async () => {\n${steps}\n})()`, { demos, recipient: "fixture" });
    if (result === 200) {
      await completion;
    } else {
      await assert.rejects(completion, /not acknowledged.*503/i);
    }
    assert.equal(demos.broadcast.mock.callCount(), 1);
  });
}
