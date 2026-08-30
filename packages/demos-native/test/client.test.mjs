import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import {
  Demos,
  Identities,
  StorageProgram,
} from "../dist/index.js";

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const EXPECTED_ADDRESS =
  "0x263af3be8487729727d99b35dcfdc61bf920a9164249ad117b292e6d3c7194f8";
const RECIPIENT =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

let server;
let rpc;
const observed = [];

function send(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

before(async () => {
  server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/storage-program/")) {
      assert.match(request.headers.identity ?? "", /^ed25519:0x[0-9a-f]{64}$/);
      assert.match(request.headers.signature ?? "", /^0x[0-9a-f]{128}$/);
      return send(response, 200, {
        success: true,
        storageAddress: request.url.slice("/storage-program/".length),
        data: { ok: true },
      });
    }
    if (request.method === "GET") return send(response, 200, { ok: true });

    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    observed.push({ body, headers: request.headers });

    if (body.method === "nodeCall") {
      const content = body.params[0];
      if (content.message === "getNetworkInfo") {
        return send(response, 200, {
          result: 200,
          response: { forks: { osDenomination: { activated: true } } },
        });
      }
      if (content.message === "getNetworkParameters") {
        return send(response, 200, {
          result: 200,
          response: { networkFee: 1, rpcFee: 0 },
        });
      }
      if (content.message === "getAddressNonce") {
        return send(response, 200, { result: 200, response: 7 });
      }
      if (content.message === "getAddressInfo") {
        return send(response, 200, {
          result: 200,
          response: { balance: "9007199254740993000", nonce: 7 },
        });
      }
      return send(response, 200, { result: 200, response: [] });
    }

    if (body.method === "gcr_routine") {
      const query = body.params[0];
      return send(response, 200, {
        result: 200,
        response: query.method === "getAccountByIdentity"
          ? [{ pubkey: EXPECTED_ADDRESS }]
          : { web2: [] },
      });
    }

    if (body.method === "web2ProxyRequest") {
      const message = body.params[0].message;
      if (message.web2Request.raw.action === "create") {
        return send(response, 200, {
          result: 200,
          response: { dahr: { sessionId: "dahr-test" } },
        });
      }
      return send(response, 200, {
        result: 200,
        response: {
          response: {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: "proof-body",
            responseHash: "ab".repeat(32),
            responseHeadersHash: "cd".repeat(32),
            timestamp: 1_800_000_000_000,
          },
        },
      });
    }

    if (body.method === "execute") {
      const content = body.params[0];
      assert.match(request.headers.identity ?? "", /^ed25519:/);
      if (content.extra === "confirmTx") {
        return send(response, 200, {
          result: 200,
          response: {
            data: {
              valid: true,
              transaction: content.data,
            },
          },
        });
      }
      return send(response, 200, {
        result: 200,
        response: JSON.stringify({ accepted: true }),
      });
    }

    return send(response, 400, { error: "unexpected request" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  rpc = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())
  );
});

test("derives the existing Demos Ed25519 wallet identity", async () => {
  const demos = new Demos();
  assert.equal(await demos.connectWallet(MNEMONIC), EXPECTED_ADDRESS);
  await assert.rejects(
    new Demos().connectWallet("not a valid mnemonic"),
    /Invalid mnemonic/,
  );
});

test("prepares post-fork native and Storage Program transactions", async () => {
  const demos = new Demos();
  await demos.connect(rpc);
  await demos.connectWallet(MNEMONIC);
  const realNow = Date.now;
  Date.now = () => 1_800_000_000_000;
  try {
    const transfer = await demos.transfer(RECIPIENT, 1_500_000_000n);
    assert.equal(transfer.content.nonce, 8);
    assert.equal(transfer.content.amount, "1500000000");
    assert.equal(transfer.content.transaction_fee.network_fee, "1000000000");
    assert.equal(transfer.content.gcr_edits[0].amount, "1500000000");
    // Byte-for-byte vector generated by @kynesyslabs/demosdk@4.0.16 for
    // this wallet, nonce, timestamp, fee response and post-fork amount.
    assert.equal(
      transfer.hash,
      "7a712e0ef2418a72cdf613dc4aa168ba7096f99206ec30c3ece541b8103c7393",
    );
    assert.equal(
      transfer.signature.data,
      "0x6386ef0b1e9641ed49113746734bec8b0567505eb250256ae232e33d791569d849ff481dd6a3bc33236b106d9265658b6e37d5a49ec98787d436061625e6200d",
    );

    const payload = StorageProgram.createStorageProgram(
      demos.getAddress(),
      "dacs-vector",
      { hello: "world" },
      "json",
      StorageProgram.publicACL(),
      { nonce: 8 },
    );
    assert.equal(
      payload.storageAddress,
      "stor-cd6b9a6fd9de2ae55a2906410a4394b87592ed50",
    );
    const storage = await demos.storagePrograms.sign(payload, { nonce: 8 });
    assert.equal(storage.content.type, "storageProgram");
    assert.equal(storage.content.nonce, 8);
    assert.equal(storage.content.gcr_edits[1].type, "storageProgram");
    assert.equal(
      storage.hash,
      "1d70cbb549ab3c87de0eb8a45c6806f7c614639260cfda49b65ec3cd2357b6f7",
    );
    assert.equal(
      storage.signature.data,
      "0x96e0671fe66b0d69e588cecd06750260807125564f6fcc3908f160988e56ce54ef78cfba4e05269bab289358267d80dc96cf1ff3e5388a8ae17a5134baf06905",
    );
    assert.equal(
      (await demos.storagePrograms.read(payload.storageAddress)).success,
      true,
    );
  } finally {
    Date.now = realNow;
  }
});

test("confirms, broadcasts and performs identity reads", async () => {
  const demos = new Demos();
  await demos.connect(rpc);
  await demos.connectWallet(MNEMONIC);
  const signed = await demos.transfer(RECIPIENT, 1_000_000_000n);
  const validity = await demos.tx.confirm(signed, demos);
  assert.equal(validity.response.data.valid, true);
  assert.deepEqual(await demos.tx.broadcast(validity, demos), {
    result: 200,
    response: { accepted: true },
  });
  assert.equal((await demos.getAddressInfo(EXPECTED_ADDRESS)).balance,
    9_007_199_254_740_993_000n);

  const identities = new Identities();
  assert.equal(
    (await identities.getIdentities(demos, "getIdentities", EXPECTED_ADDRESS)).result,
    200,
  );
  assert.deepEqual(
    await identities.getDemosIdsByWeb2Identity(demos, "github", "dacs"),
    [{ pubkey: EXPECTED_ADDRESS }],
  );
});

test("fails closed instead of signing nonce one after an RPC failure", async () => {
  const demos = new Demos();
  await demos.connect(rpc);
  await demos.connectWallet(MNEMONIC);
  demos.nodeCall = async () => ({ result: 500, require_reply: false });
  await assert.rejects(
    demos.transfer(RECIPIENT, 1_000_000_000n),
    /valid address nonce/,
  );
});

test("fails closed on malformed account and history RPC results", async () => {
  const demos = new Demos();
  await demos.connect(rpc);
  demos.nodeCall = async () => ({ result: 500, require_reply: false });
  await assert.rejects(
    demos.getAddressInfo(EXPECTED_ADDRESS),
    /valid address information/,
  );
  await assert.rejects(
    demos.getTransactionHistory(EXPECTED_ADDRESS),
    /valid transaction history/,
  );

  demos.nodeCall = async () => ({ balance: -1 });
  await assert.rejects(
    demos.getAddressInfo(EXPECTED_ADDRESS),
    /invalid address balance/,
  );

  demos.rpcCall = async () => ({
    result: 503,
    response: { error: "unavailable" },
  });
  await assert.rejects(
    new Identities().getDemosIdsByWeb2Identity(demos, "github", "dacs"),
    /identity lookup failed with RPC result 503/,
  );
});

test("does not retry a definite HTTP rejection", async () => {
  const demos = new Demos();
  await demos.connect(rpc);
  const before = observed.length;
  assert.equal((await demos.rpcCall({ method: "unsupported", params: [] })).result, 500);
  assert.equal(observed.length - before, 1);
});

test("refuses to sign without an authenticated denomination state", async () => {
  const demos = new Demos();
  await demos.connect(rpc);
  await demos.connectWallet(MNEMONIC);
  demos.getNetworkInfo = async () => null;
  await assert.rejects(
    demos.transfer(RECIPIENT, 1_000_000_000n),
    /denomination-fork state is unavailable/,
  );
});

test("runs the DACS-used DAHR create/start/anchor flow", async () => {
  const demos = new Demos();
  await demos.connect(rpc);
  await demos.connectWallet(MNEMONIC);
  const dahr = await demos.web2.createDahr();
  const result = await dahr.startProxy({
    url: "https://example.com/proof#discarded",
    method: "GET",
    options: { headers: { Accept: "application/json" } },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body, "proof-body");
  assert.match(result.txHash, /^[0-9a-f]{64}$/);
  assert.ok(observed.some(({ body }) =>
    body.method === "web2ProxyRequest" &&
    body.params[0].message.web2Request.raw.url === "https://example.com/proof"
  ));
});
