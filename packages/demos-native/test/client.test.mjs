import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import {
  Demos,
  Identities,
  StorageProgram,
  Web2Proxy,
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
  assert.match(await demos.signMessage("register:test:1"), /^[0-9a-f]{128}$/);
  await assert.rejects(demos.signMessage(""), /must be a non-empty string/);
  await assert.rejects(
    new Demos().connectWallet("not a valid mnemonic"),
    /^Error: Invalid recovery phrase/,
  );
});

test("refuses a phrase that is not a valid BIP-39 mnemonic", async () => {
  const wrongPhrases = {
    capitalisedFirstWord: MNEMONIC.replace("abandon", "Abandon"),
    typo: MNEMONIC.replace("about", "abot"),
    badChecksum: MNEMONIC.replace("about", "abandon"),
    wrongWordCount: "abandon abandon abandon",
    // Both pass validateMnemonic, which applies NFKD, but are not canonical.
    ideographicSpaces: MNEMONIC.replaceAll(" ", "\u{3000}"),
    fullWidthLetter: MNEMONIC.replace("about", "\u{ff41}bout"),
  };
  for (const [name, phrase] of Object.entries(wrongPhrases)) {
    const demos = new Demos();
    await assert.rejects(
      demos.connectWallet(phrase),
      (error) => error.message.startsWith("Invalid recovery phrase") &&
        !error.message.includes("abandon"),
      name,
    );
    assert.equal(demos.crypto.connected, false, name);
  }
});

// Addresses recorded at the base before the phrase check; it must not move them.
test("keeps the address of a valid phrase and of seed inputs", async () => {
  const phrase = "legal winner thank year wave sausage worth useful legal winner thank yellow";
  assert.equal(
    await new Demos().connectWallet(`  ${phrase}  `),
    "0xaac8381cb0f464a48ddb8ef8829829de69ae8236b9318ed481c8d6589b6895bb",
  );
  assert.equal(
    await new Demos().connectWallet(
      Uint8Array.from({ length: 128 }, (_, i) => (i * 5 + 1) % 256),
    ),
    "0xe37e58b4b72dfeca5711d419ab396d9aa618bc2bc5018ec2d53896a6081435e3",
  );
  assert.equal(
    await new Demos().connectWallet(
      Uint8Array.from({ length: 32 }, (_, i) => (i * 5 + 1) % 256),
    ),
    "0x52a275a720c58f0bf12da3743b9443d44f2252dbdeef4730fb06edc04010c78a",
  );
  // A string with no whitespace never reaches the phrase check; as before the
  // change it is rejected by the BIP-39 seed conversion.
  const hexSeed = Array.from({ length: 128 }, (_, i) => "0123456789abcdef"[(i * 7 + 3) % 16]).join("");
  await assert.rejects(new Demos().connectWallet(hexSeed), /^Error: Invalid mnemonic/);
});

// Keys and signatures recorded from the node-forge implementation this
// package used through 0.1.0-alpha.1; switching crypto must not change them.
test("keeps the Ed25519 keys and signatures of earlier releases", async () => {
  const demos = new Demos();
  await demos.connectWallet(MNEMONIC);
  const identity = await demos.crypto.getIdentity("ed25519");
  assert.equal(Buffer.from(identity.publicKey).toString("hex"), "263af3be8487729727d99b35dcfdc61bf920a9164249ad117b292e6d3c7194f8");
  assert.equal(
    Buffer.from(identity.privateKey).toString("hex"),
    "9c059a934eed1a4244dc564888d780e60a3b55bc20b67603ddf8633d9ac72959263af3be8487729727d99b35dcfdc61bf920a9164249ad117b292e6d3c7194f8",
  );
  const cases = {
    ascii: new TextEncoder().encode("register:test:1"),
    utf8: new TextEncoder().encode("héllo ✓ мир"),
    nonUtf8: new Uint8Array([0xff, 0x00, 0xc3, 0x28, 0x41]),
  };
  const expected = {
    ascii: "bcca9aaadc7124e565ea76566699198fb8120d559c5e00c58d4b3ad548f94a9052ef689240d010b1b9d5c579cfe6dadffc96f7aaff8cbbe59ab7bc3858a1c80a",
    utf8: "7eab43a1b92870dc83bc9c36e04524239b3e0c45c45ef47a7573f71157969bd2e8eecce91c7cf890c56c283ca8c096d4c227ea6f620233b0c7ad18842ea67708",
    nonUtf8: "ddaf3a4bd9eda2dea64b51f08b5369f5e70351958b86b8e20eb081208dad26127ea72ec275e06115d230a0456d0e7d35d5978d28175c3925dab8d543d189870f",
  };
  for (const [name, message] of Object.entries(cases)) {
    const signed = await demos.crypto.sign("ed25519", message);
    assert.equal(Buffer.from(signed.signature).toString("hex"), expected[name], name);
  }
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

test("fails closed on rejected or malformed DAHR evidence", async () => {
  const rejected = new Demos();
  await rejected.connectWallet(MNEMONIC);
  rejected.call = async () => ({
    result: 503,
    response: { error: "unavailable" },
  });
  await assert.rejects(
    new Web2Proxy("dahr-rejected", rejected).startProxy({
      url: "https://example.com/proof",
      method: "GET",
    }),
    /DAHR request failed with RPC result 503/,
  );

  const malformed = new Demos();
  await malformed.connectWallet(MNEMONIC);
  malformed.call = async () => ({ result: 200, response: {} });
  await assert.rejects(
    new Web2Proxy("dahr-malformed", malformed).startProxy({
      url: "https://example.com/proof",
      method: "GET",
    }),
    /invalid response evidence/,
  );
});

test("does not report a DAHR tx hash after broadcast rejection", async () => {
  const demos = new Demos();
  await demos.connect(rpc);
  await demos.connectWallet(MNEMONIC);
  demos.broadcast = async () => ({
    result: 503,
    response: { error: "not accepted" },
  });
  await assert.rejects(
    new Web2Proxy("dahr-test", demos).startProxy({
      url: "https://example.com/proof",
      method: "GET",
      options: { nonce: 8 },
    }),
    /DAHR anchor broadcast failed with RPC result 503/,
  );
});

test("fails closed on a rejected DAHR session creation envelope", async () => {
  const demos = new Demos();
  await demos.connectWallet(MNEMONIC);
  demos.call = async () => ({ result: 500, response: new Error("offline") });
  await assert.rejects(
    demos.web2.createDahr(),
    /DAHR session creation failed with RPC result 500/,
  );
});

async function listen(t, handler) {
  const bounded = createServer(handler);
  await new Promise((resolve) => bounded.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    bounded.closeAllConnections();
    bounded.close();
  });
  return `http://127.0.0.1:${bounded.address().port}`;
}

test("ends an RPC request at the deadline", { timeout: 10_000 }, async (t) => {
  let posts = 0;
  const base = await listen(t, (request, response) => {
    request.resume();
    if (request.method === "GET") {
      if (request.url === "/" || request.url === "/drip") {
        return send(response, 200, { ok: true });
      }
      return;
    }
    posts += 1;
    if (request.url === "/drip") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.write('{"result":200,');
      const drip = setInterval(() => response.write(" "), 20);
      response.on("close", () => clearInterval(drip));
    }
  });
  const late = (url) => `Demos RPC request to ${url} exceeded the 200 ms deadline`;

  const demos = new Demos({ rpcTimeoutMs: 200 });
  await demos.connect(base);
  await demos.connectWallet(MNEMONIC);
  const silent = await demos.rpcCall({ method: "nodeCall", params: [] });
  assert.equal(silent.result, 500);
  assert.equal(silent.response.message, late(`${base}/`));
  assert.equal(posts, 1);
  await assert.rejects(
    demos.transfer(RECIPIENT, 1_000_000_000n),
    /valid address nonce/,
  );
  const storage = `stor-${"a".repeat(40)}`;
  await assert.rejects(
    demos.storagePrograms.read(storage),
    { message: late(`${base}/storage-program/${storage}`) },
  );

  const dripping = new Demos({ rpcTimeoutMs: 200 });
  await dripping.connect(`${base}/drip`);
  const dripped = await dripping.rpcCall({ method: "nodeCall", params: [] });
  assert.equal(dripped.response.message, late(`${base}/drip`));

  // The query string and hash, which may carry an API key, stay out of the error.
  await assert.rejects(
    new Demos({ rpcTimeoutMs: 200 }).connect(`${base}/silent?key=SECRET#frag`),
    { message: late(`${base}/silent`) },
  );
});

test("ends a static Storage Program read at the default deadline", { timeout: 10_000 }, async (t) => {
  let arrived;
  const received = new Promise((resolve) => { arrived = resolve; });
  const base = await listen(t, (request) => {
    request.resume();
    arrived();
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const read = StorageProgram.getByAddress(base, `stor-${"c".repeat(40)}`);
  await received;
  t.mock.timers.tick(120_000);
  await assert.rejects(read, {
    message: `Demos RPC request to ${base}/ exceeded the 120000 ms deadline`,
  });
});

test("stops reading an RPC response past the size cap", { timeout: 30_000 }, async (t) => {
  const reply = JSON.stringify({ result: 200, response: "within cap" });
  const base = await listen(t, (request, response) => {
    request.resume();
    if (request.method === "GET" && !request.url.startsWith("/storage-program/")) {
      return send(response, 200, { ok: true });
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    if (request.url.startsWith("/exact")) return response.end(reply);
    // A finite reply 1 MiB past the default 64 MiB cap.
    const chunk = Buffer.alloc(1024 * 1024, 0x61);
    let left = 65;
    response.write('{"result":200,"response":"');
    const pump = () => {
      while (left > 0 && !response.destroyed) {
        left -= 1;
        if (!response.write(chunk)) return response.once("drain", pump);
      }
      if (!response.destroyed) response.end('"}');
    };
    pump();
  });
  const tooLarge = (url, cap) =>
    `Demos RPC response from ${url} exceeded the ${cap}-byte size cap`;

  const demos = new Demos();
  await demos.connect(base);
  const oversized = await demos.rpcCall({ method: "nodeCall", params: [] });
  assert.equal(oversized.result, 500);
  assert.equal(oversized.response.message, tooLarge(`${base}/`, 64 * 1024 * 1024));

  const storage = `stor-${"b".repeat(40)}`;
  const small = new Demos({ rpcMaxResponseBytes: 1_024 });
  await small.connect(base);
  await assert.rejects(
    small.storagePrograms.read(storage),
    { message: tooLarge(`${base}/storage-program/${storage}`, 1_024) },
  );

  const exact = new Demos({ rpcMaxResponseBytes: reply.length });
  await exact.connect(`${base}/exact`);
  assert.deepEqual(
    await exact.rpcCall({ method: "nodeCall", params: [] }),
    JSON.parse(reply),
  );
  const short = new Demos({ rpcMaxResponseBytes: reply.length - 1 });
  await short.connect(`${base}/exact?key=SECRET`);
  assert.equal(
    (await short.rpcCall({ method: "nodeCall", params: [] })).response.message,
    tooLarge(`${base}/exact`, reply.length - 1),
  );
});

test("rejects RPC bounds that are not positive integers in range", () => {
  // Node's fetch ends a request after 300 s without headers, before a longer deadline.
  assert.equal(new Demos({ rpcTimeoutMs: 300_000 }).walletConnected, false);
  for (const options of [
    { rpcTimeoutMs: 0 },
    { rpcTimeoutMs: 1.5 },
    { rpcTimeoutMs: 300_001 },
    { rpcTimeoutMs: 2 ** 31 },
    { rpcMaxResponseBytes: -1 },
    { rpcMaxResponseBytes: Infinity },
  ]) {
    assert.throws(() => new Demos(options), TypeError);
  }
});

test("never resends a POST once the node has replied", { timeout: 10_000 }, async (t) => {
  let posts = 0;
  const base = await listen(t, (request, response) => {
    request.resume();
    if (request.method === "GET") return send(response, 200, { ok: true });
    posts += 1;
    // Successful headers and part of the body, then the connection drops.
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write('{"result":200,', () => setTimeout(() => response.destroy(), 50));
  });

  const demos = new Demos({ rpcTimeoutMs: 5_000 });
  await demos.connect(base);
  const cut = await demos.rpcCall({ method: "nodeCall", params: [] });
  assert.equal(cut.result, 500);
  assert.equal(
    cut.response.message,
    `Demos RPC response from ${base}/ could not be read`,
  );
  assert.equal(posts, 1);
});

test("closes an unread RPC body before returning", { timeout: 10_000 }, async (t) => {
  const closed = [];
  const base = await listen(t, (request, response) => {
    request.resume();
    // Headers, then a body that never ends.
    response.writeHead(request.method === "GET" ? 200 : 500, {
      "Content-Type": "application/json",
    });
    response.write("{");
    const drip = setInterval(() => response.write(" "), 20);
    closed.push(new Promise((resolve) => {
      response.on("close", () => {
        clearInterval(drip);
        resolve();
      });
    }));
  });
  // Well inside the 5 s deadline, so only cancelling the body can close it.
  const within = (closing) => Promise.race([
    closing,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("unread body left open")), 1_000);
    }),
  ]);

  const demos = new Demos({ rpcTimeoutMs: 5_000 });
  await demos.connect(base);
  await within(closed[0]);
  const failed = await demos.rpcCall({ method: "nodeCall", params: [] });
  assert.equal(failed.response.message, "Demos RPC failed with HTTP 500");
  assert.equal(closed.length, 2);
  await within(closed[1]);
});
