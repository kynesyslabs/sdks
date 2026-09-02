import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { WebSocketServer } from "ws";

import { L2PSMessagingPeer } from "../dist/messaging.js";

const BUYER = "11".repeat(32);
const SELLER = "22".repeat(32);
const SIGNATURE = "33".repeat(64);
const L2PS_UID = "rfq-test-subnet";

function response(socket, request, type, payload) {
  socket.send(JSON.stringify({
    type,
    payload,
    timestamp: Date.now(),
    requestId: request.requestId,
  }));
}

async function createMessagingServer() {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const connections = new Map();
  const identities = new WeakMap();
  const messages = [];
  let sendCount = 0;

  server.on("connection", (socket) => {
    socket.on("message", (raw) => {
      const request = JSON.parse(raw.toString("utf8"));
      if (request.type === "register") {
        const key = request.payload.publicKey;
        identities.set(socket, key);
        connections.set(key, socket);
        response(socket, request, "registered", {
          success: true,
          publicKey: key,
          l2psUid: request.payload.l2psUid,
          onlinePeers: [...connections.keys()].filter((candidate) => candidate !== key),
        });
        return;
      }

      const from = identities.get(socket);
      if (request.type === "send") {
        sendCount += 1;
        const stored = {
          id: `message-${sendCount}`,
          from,
          to: request.payload.to,
          messageHash: request.payload.messageHash,
          encrypted: request.payload.encrypted,
          l2psUid: L2PS_UID,
          l2psTxHash: null,
          timestamp: Date.now(),
          status: "delivered",
        };
        messages.push(stored);
        const recipient = connections.get(request.payload.to);
        if (recipient) {
          recipient.send(JSON.stringify({
            type: "message",
            payload: {
              from,
              encrypted: stored.encrypted,
              messageHash: stored.messageHash,
            },
            timestamp: Date.now(),
          }));
          response(socket, request, "message_sent", {
            messageHash: stored.messageHash,
            l2psStatus: "submitted",
          });
        } else {
          stored.status = "queued";
          response(socket, request, "message_queued", {
            messageHash: stored.messageHash,
            status: "queued",
          });
        }
        return;
      }

      if (request.type === "history") {
        const peer = request.payload.peerKey;
        const page = messages.filter((message) =>
          (message.from === from && message.to === peer) ||
          (message.from === peer && message.to === from));
        response(socket, request, "history_response", {
          messages: page,
          hasMore: false,
        });
        return;
      }

      if (request.type === "discover") {
        response(socket, request, "discover_response", {
          peers: [...connections.keys()].filter((candidate) => candidate !== from),
        });
        return;
      }

      if (request.type === "request_public_key") {
        response(socket, request, "public_key_response", {
          targetId: request.payload.targetId,
          publicKey: connections.has(request.payload.targetId)
            ? request.payload.targetId
            : null,
        });
      }
    });
    socket.on("close", () => {
      const key = identities.get(socket);
      if (key && connections.get(key) === socket) connections.delete(key);
    });
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    url: `ws://127.0.0.1:${address.port}`,
    sendCount: () => sendCount,
    async close() {
      for (const socket of connections.values()) socket.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function peer(serverUrl, publicKey) {
  return new L2PSMessagingPeer({
    serverUrl,
    publicKey,
    l2psUid: L2PS_UID,
    signFn: () => SIGNATURE,
    requestTimeoutMs: 1_000,
    connectTimeoutMs: 1_000,
    maxReconnectAttempts: 0,
  });
}

test("two peers send, receive and reconcile history after restart", async (t) => {
  const server = await createMessagingServer();
  const buyer = peer(server.url, BUYER);
  const seller = peer(server.url, SELLER);
  t.after(async () => {
    buyer.disconnect();
    seller.disconnect();
    await server.close();
  });

  await buyer.connect();
  await seller.connect();
  assert.deepEqual(await buyer.discover(), [SELLER]);

  const messageHash = "44".repeat(32);
  const inbound = new Promise((resolve) => seller.onMessage(resolve));
  const result = await buyer.send(
    SELLER,
    { ciphertext: "Y2lwaGVydGV4dA==", nonce: "bm9uY2U=" },
    messageHash,
  );
  assert.deepEqual(result, { messageHash, l2psStatus: "submitted" });
  assert.deepEqual(await inbound, {
    from: BUYER,
    encrypted: { ciphertext: "Y2lwaGVydGV4dA==", nonce: "bm9uY2U=" },
    messageHash,
  });
  assert.equal(server.sendCount(), 1);

  buyer.disconnect();
  const recoveredBuyer = peer(server.url, BUYER);
  t.after(() => recoveredBuyer.disconnect());
  await recoveredBuyer.connect();
  const history = await recoveredBuyer.history(SELLER, { limit: 100 });
  assert.equal(history.hasMore, false);
  assert.equal(history.messages.length, 1);
  assert.equal(history.messages[0].messageHash, messageHash);
  assert.equal(server.sendCount(), 1, "history reconciliation must not resend");
});

test("configuration and effect identifiers fail closed", async () => {
  assert.throws(
    () => peer("https://example.com", BUYER),
    /serverUrl must use ws: or wss:/,
  );
  const server = await createMessagingServer();
  const buyer = peer(server.url, BUYER);
  try {
    await buyer.connect();
    await assert.rejects(
      buyer.send(SELLER, { ciphertext: "x", nonce: "y" }, "not-a-hash"),
      /messageHash must be 32-byte lowercase hex/,
    );
    assert.equal(server.sendCount(), 0);
  } finally {
    buyer.disconnect();
    await server.close();
  }
});
