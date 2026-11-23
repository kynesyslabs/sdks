import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import { Demos, NodeCallError } from "../dist/index.js";

// Replies shaped as kynesyslabs/node v1.0.0-rc.14 sends them; see the
// fixture's `_about` and each entry's `source`.
const { replies } = JSON.parse(
  readFileSync(new URL("./fixtures/node-proof-calls.json", import.meta.url), "utf8"),
);
const body = (name) => structuredClone(replies[name].reply.response);
// The included-but-failed transfer of the node's requester fixture N07.
const N07_HASH = "85b8fcdcee48822742a39e1b9877f5e2f8dde36430e8e486e3a8b0c9a7744cbd";

let server;
let rpc;
/** What the node answers next, one entry per POST: a fixture name or `{ status }`. */
let queue = [];
let seen = [];

before(async () => {
  server = createServer(async (request, response) => {
    if (request.method === "GET") {
      response.writeHead(200, { "Content-Type": "application/json" });
      return response.end("{}");
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    seen.push({ body: JSON.parse(Buffer.concat(chunks).toString("utf8")), headers: request.headers });
    const next = queue.shift();
    if (typeof next === "object") {
      response.writeHead(next.status, { "Content-Type": "application/json" });
      return response.end(next.text ?? "{}");
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(replies[next].reply));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  rpc = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  queue = [];
  seen = [];
});

async function connected() {
  const demos = new Demos();
  await demos.connect(rpc);
  return demos;
}

test("typed reads return the node's answer from a plain, unauthenticated nodeCall", async () => {
  const demos = await connected();
  const proofHash = body("transactionProof").hash;
  const cases = [
    ["chainIdentity", () => demos.getChainIdentity(), "getChainIdentity", {}],
    ["finalizedHead", () => demos.getFinalizedHead(), "getFinalizedHead", {}],
    ["blockSegment", () => demos.getBlockSegment(529_478, 529_479), "getBlockSegment", { from: 529_478, to: 529_479 }],
    ["validatorSet", () => demos.getValidatorSet(529_478), "getValidatorSet", { blockNumber: 529_478 }],
    ["transactionProof", () => demos.getTransactionProof(proofHash), "getTransactionProof", { hash: proofHash }],
    ["storageProof", () => demos.getStorageProof(["stor-a", "stor-b"]), "getStorageProof", { storageAddresses: ["stor-a", "stor-b"] }],
    ["storageProof", () => demos.getStorageProof(["stor-a"], 529_470), "getStorageProof", { storageAddresses: ["stor-a"], blockNumber: 529_470 }],
    ["storageProgramLimits", () => demos.getStorageProgramLimits(), "getStorageProgramLimits", {}],
  ];
  for (const [fixture, read, message, data] of cases) {
    queue.push(fixture);
    assert.deepEqual(await read(), body(fixture), fixture);
    const { body: sent, headers } = seen.at(-1);
    assert.deepEqual(sent, { method: "nodeCall", params: [{ message, data }] });
    assert.equal(headers.identity, undefined);
    assert.equal(headers.signature, undefined);
  }
});

test("getTransactionStatus keeps failed, checkedThroughBlock and resultCommittedInBlock", async () => {
  const demos = await connected();
  queue.push("statusFailedPreFork", "statusIncludedAwaitingCommitment", "statusIncludedCommitted");

  const failed = await demos.getTransactionStatus(N07_HASH);
  assert.deepEqual(seen.at(-1).body.params[0].data, { hash: N07_HASH });
  assert.deepEqual(failed, {
    state: "failed",
    blockNumber: 480_877,
    code: "TX_NONCE_INVALID_LOW",
    message: "Nonce too low",
    checkedThroughBlock: 529_479,
  });
  // Before the finalityProofs fork no block commits the result: absent, not null.
  assert.equal(Object.hasOwn(failed, "resultCommittedInBlock"), false);

  const awaiting = await demos.getTransactionStatus("ab".repeat(32));
  assert.equal(awaiting.resultCommittedInBlock, null);
  assert.equal(awaiting.checkedThroughBlock, 529_478);

  const committed = await demos.getTransactionStatus("ab".repeat(32));
  assert.equal(committed.resultCommittedInBlock, 529_479);
  assert.deepEqual(seen.at(-1).body.params[0].data, { hash: "ab".repeat(32) });
});

test("a refusal reaches the caller with its result code, reason and body", async () => {
  const demos = await connected();
  const refusals = [
    ["transactionProofNoResultCommitment", () => demos.getTransactionProof(N07_HASH), 404, "no_result_commitment"],
    ["transactionProofNotYetCommitted", () => demos.getTransactionProof("ab".repeat(32)), 409, "not_yet_committed"],
    ["statusNotFound", () => demos.getTransactionStatus("ab".repeat(32)), 404, "not_found"],
    ["finalizedHeadNotSynced", () => demos.getFinalizedHead(), 503, "node_not_synced"],
    ["validatorSetHistoryUnavailable", () => demos.getValidatorSet(12), 410, "history_unavailable"],
    ["blockSegmentRangeTooLarge", () => demos.getBlockSegment(0, 10_000), 400, "range_too_large"],
    ["storageProofHistoryUnavailable", () => demos.getStorageProof(["stor-a"], 100), 410, "history_unavailable"],
  ];
  for (const [fixture, read, result, reason] of refusals) {
    queue.push(fixture);
    await assert.rejects(read(), (error) => {
      assert.ok(error instanceof NodeCallError, fixture);
      assert.equal(error.name, "NodeCallError");
      assert.equal(error.result, result, fixture);
      assert.equal(error.reason, reason, fixture);
      assert.deepEqual(error.response, body(fixture), fixture);
      assert.match(error.message, new RegExp(`refused with ${result}: ${reason}`));
      return true;
    });
  }

  // The pre-fork refusal names the block; a not-found status the height searched.
  queue.push("transactionProofNoResultCommitment", "statusNotFound");
  await assert.rejects(demos.getTransactionProof(N07_HASH), { response: { error: "no_result_commitment", blockNumber: 480_877 } });
  await assert.rejects(demos.getTransactionStatus("ab".repeat(32)), { response: { state: "unknown", checkedThroughBlock: 529_479 } });
});

test("a node that does not serve the call refuses without a reason", async () => {
  const demos = await connected();
  queue.push("unknownMessage");
  await assert.rejects(demos.getFinalizedHead(), (error) => {
    assert.ok(error instanceof NodeCallError);
    assert.equal(error.result, 404);
    assert.equal(error.reason, undefined);
    assert.equal(error.response.error, "Unknown message");
    assert.match(error.message, /refused with 404: Unknown message/);
    return true;
  });
});

test("a refusal whose error is an object names it as JSON", async () => {
  const demos = await connected();
  const reply = { result: 500, response: { error: { code: 7 } } };
  queue.push({ status: 200, text: JSON.stringify(reply) });
  await assert.rejects(demos.getFinalizedHead(), (error) => {
    assert.ok(error instanceof NodeCallError);
    assert.equal(error.result, 500);
    assert.equal(error.reason, undefined);
    assert.deepEqual(error.response, { error: { code: 7 } });
    assert.match(error.message, /refused with 500: \{"code":7\}/);
    assert.doesNotMatch(error.message, /\[object Object\]/);
    return true;
  });
});

test("a handler crash names the cause the node's dispatcher gives", async () => {
  const demos = await connected();
  // The node's dispatcher reply to a handler crash (node rpcDispatch.ts:151-160 at 4877499a).
  const reply = { result: 500, response: "Error in nodeCall: ", extra: { error: "chain head not loaded" } };
  queue.push({ status: 200, text: JSON.stringify(reply) });
  await assert.rejects(demos.getFinalizedHead(), (error) => {
    assert.ok(error instanceof NodeCallError);
    assert.equal(error.result, 500);
    assert.equal(error.reason, undefined);
    assert.equal(error.response, "Error in nodeCall: ");
    assert.deepEqual(error.extra, { error: "chain head not loaded" });
    assert.match(error.message, /refused with 500: Error in nodeCall: +\(chain head not loaded\)$/);
    return true;
  });
});

test("an error too deeply nested to print still becomes a NodeCallError", async () => {
  const demos = await connected();
  // JSON.stringify of this value throws RangeError, so the reply is written by hand.
  const depth = 200_000;
  const text = `{"result":500,"response":{"error":${"[".repeat(depth)}${"]".repeat(depth)}}}`;
  queue.push({ status: 200, text });
  await assert.rejects(demos.getFinalizedHead(), (error) => {
    assert.ok(error instanceof NodeCallError);
    assert.equal(error.result, 500);
    assert.match(error.message, /refused with 500: unprintable error$/);
    return true;
  });
});

test("node text in the message is cleaned and cut, the fields keep it whole", async () => {
  const demos = await connected();
  const multiline = "not_found\n[INFO] x";
  queue.push({ status: 200, text: JSON.stringify({ result: 404, response: {}, extra: { reason: multiline } }) });
  await assert.rejects(demos.getFinalizedHead(), (error) => {
    assert.ok(error instanceof NodeCallError);
    assert.doesNotMatch(error.message, /[\r\n]/);
    assert.match(error.message, /refused with 404: not_found \[INFO\] x$/);
    assert.equal(error.reason, multiline);
    return true;
  });

  const long = "r".repeat(10_000);
  queue.push({ status: 200, text: JSON.stringify({ result: 404, response: {}, extra: { reason: long } }) });
  await assert.rejects(demos.getFinalizedHead(), (error) => {
    assert.ok(error instanceof NodeCallError);
    assert.ok(error.message.length <= 300, `message is ${error.message.length} characters`);
    assert.match(error.message, /r…$/);
    assert.equal(error.reason, long);
    assert.deepEqual(error.extra, { reason: long });
    return true;
  });

  const cause = `chain head\u0000not loaded ${"c".repeat(500)}`;
  queue.push({ status: 200, text: JSON.stringify({ result: 500, response: "Error in nodeCall: ", extra: { error: cause } }) });
  await assert.rejects(demos.getFinalizedHead(), (error) => {
    assert.ok(error instanceof NodeCallError);
    assert.equal(error.message.includes("\u0000"), false);
    assert.match(error.message, /\(chain head not loaded c+…\)$/);
    assert.ok(error.message.length <= 300, `message is ${error.message.length} characters`);
    assert.deepEqual(error.extra, { error: cause });
    return true;
  });
});

test("C1 controls, line separators and bidirectional controls are cleaned from the message", async () => {
  const demos = await connected();
  // U+0085 next line (C1), U+2028 line separator, U+202E right-to-left override.
  const reason = "not_found\u0085[INFO] x\u2028y\u202ez";
  queue.push({ status: 200, text: JSON.stringify({ result: 404, response: {}, extra: { reason } }) });
  await assert.rejects(demos.getFinalizedHead(), (error) => {
    assert.ok(error instanceof NodeCallError);
    assert.doesNotMatch(error.message, /[\u0085\u2028\u202e]/);
    assert.match(error.message, /refused with 404: not_found \[INFO\] x y z$/);
    assert.equal(error.reason, reason);
    return true;
  });
});

test("cutting the message does not split a surrogate pair", async () => {
  const demos = await connected();
  // The emoji's high surrogate is the 200th code unit, where the cut falls.
  const reason = `${"a".repeat(199)}\u{1F600}tail`;
  queue.push({ status: 200, text: JSON.stringify({ result: 404, response: {}, extra: { reason } }) });
  await assert.rejects(demos.getFinalizedHead(), (error) => {
    assert.ok(error instanceof NodeCallError);
    assert.doesNotMatch(error.message, /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/);
    assert.match(error.message, /refused with 404: a{199}…$/);
    assert.equal(error.reason, reason);
    return true;
  });
});

test("nodeCall still returns the bare body of the same refusal", async () => {
  const demos = await connected();
  queue.push("transactionProofNoResultCommitment");
  assert.deepEqual(
    await demos.nodeCall("getTransactionProof", { hash: N07_HASH }),
    body("transactionProofNoResultCommitment"),
  );
});

test("a transport failure or a malformed reply is not read as a refusal", async () => {
  const demos = await connected();
  queue.push({ status: 400 });
  await assert.rejects(demos.getChainIdentity(), (error) => {
    assert.equal(error instanceof NodeCallError, false);
    assert.match(error.message, /HTTP 400/);
    return true;
  });

  queue.push({ status: 200, text: JSON.stringify({ response: { chainId: 1 } }) });
  await assert.rejects(demos.getChainIdentity(), { name: "TypeError", message: /no valid getChainIdentity reply/ });

  queue.push({ status: 200, text: JSON.stringify({ result: 200, response: "STATE_NOT_READY" }) });
  await assert.rejects(demos.getChainIdentity(), { name: "TypeError", message: /no valid getChainIdentity answer/ });
});
