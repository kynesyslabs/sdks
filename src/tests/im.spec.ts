import {
    MessagingPeer,
    Message,
    MessagingPeerConfig,
} from "@/instant_messaging"
import { unifiedCrypto } from "@/encryption/unifiedCrypto"
import { randomBytes } from "crypto"
import * as forge from "node-forge"
import * as socket from 'socket.io-client';
interface keyType {
    publicKey: any | forge.pki.PublicKey | forge.pki.ed25519.NativeBuffer
    privateKey: any | forge.pki.PrivateKey | forge.pki.ed25519.NativeBuffer
    genKey?: Uint8Array
}

var ed25519: keyType = null
var falcon: keyType = null
var mlDsa: keyType = null
var mlKemAes: keyType = null

var masterSeed: Uint8Array = null

// First of all, we need to ensure the client has an identity
beforeAll(async () => {
    console.log("[Preflight] Generating identities")
    masterSeed = randomBytes(128)
    let textualMasterSeed = Buffer.from(masterSeed).toString("hex")
    console.log("[Preflight] Master seed generated: ", textualMasterSeed)
    await unifiedCrypto.generateAllIdentities(masterSeed)
    ed25519 = await unifiedCrypto.getIdentity("ed25519")
    falcon = await unifiedCrypto.getIdentity("falcon")
    mlDsa = await unifiedCrypto.getIdentity("ml-dsa")
    mlKemAes = await unifiedCrypto.getIdentity("ml-kem-aes")
    if (!ed25519 || !falcon || !mlDsa || !mlKemAes) {
        throw new Error("Failed to generate identities:")
        if (!ed25519) {
            console.error("Ed25519 identity not generated")
        }
        if (!falcon) {
            console.error("Falcon identity not generated")
        }
        if (!mlDsa) {
            console.error("ML-DSA identity not generated")
        }
        if (!mlKemAes) {
            console.error("ML-KEM-AES identity not generated")
        }
        throw new Error("Failed to generate identities")
    }

    console.log(
        "[Preflight] Identities generated for: ed25519, falcon, ml-dsa, ml-kem-aes",
    )
})

// IM setup
describe("IM setup", () => {
    it("should be able to create a new IM instance", async () => {
        const im = new MessagingPeer(
            {
                serverUrl: "http://localhost:3005",
                clientId: "test-client-id",
                publicKey: mlKemAes.publicKey,
            }
        )
        expect(im).toBeDefined()
    })
    it("should be able to connect to the server and register the client", async () => {
        const im = new MessagingPeer(
            {
                serverUrl: "http://localhost:3005",
                clientId: "test-client-id",
                publicKey: mlKemAes.publicKey,
            }
        )
        await im.connect()
        await new Promise(resolve => setTimeout(resolve, 1000))
        expect(im.ws.readyState).toBe(WebSocket.OPEN)
    })
    it("should fail to register a new client as the client id is already taken", async () => {
        const im = new MessagingPeer(
            {
                serverUrl: "http://localhost:3005",
                clientId: "test-client-id",
                publicKey: mlKemAes.publicKey,
            }
        )
        let success = false
        try {
            await im.connect()
            await new Promise(resolve => setTimeout(resolve, 1000))
            expect(im.ws.readyState).toBe(WebSocket.OPEN)
        } catch (error) {
            success = true
        }
        expect(success).toBe(true)
    })
    it("should be able to retrieve the list of available peers", async () => {
        const im = new MessagingPeer(
            {
                serverUrl: "http://localhost:3005",
                clientId: "second-client-id",
                publicKey: mlKemAes.publicKey,
            }
        )
        await im.connect()
        await new Promise(resolve => setTimeout(resolve, 1000))
        expect(im.ws.readyState).toBe(WebSocket.OPEN)
        const peers = await im.discoverPeers()
        console.log("[IM] Peers: ", peers)
        expect(peers).toBeDefined()
        expect(peers.length).toBeGreaterThan(0)
    })
    it("should be able to send a message to a peer", async () => {
        const alice = new MessagingPeer(
            {
                serverUrl: "http://localhost:3005",
                clientId: "alice",
                publicKey: mlKemAes.publicKey,
            }
        )
        const bob = new MessagingPeer(
            {
                serverUrl: "http://localhost:3005",
                clientId: "bob",
                publicKey: mlKemAes.publicKey,
            }
        )
        await alice.connect()
        await new Promise(resolve => setTimeout(resolve, 1000))
        expect(alice.ws.readyState).toBe(WebSocket.OPEN)
        await bob.connect()
        await new Promise(resolve => setTimeout(resolve, 1000))
        expect(bob.ws.readyState).toBe(WebSocket.OPEN)
        // Alice sends a message to bob and bob receives it
        const messagesPromise = bob.awaitResponse<Buffer>("message") // NOTE Setting up a promise to receive the message as we don't know when it will arrive
        const message = "Hello from me!"
        console.log("[IM-TEST] [ALICE] Sending message to bob: ", message)
        await alice.sendMessage("bob", message)
        console.log("[IM-TEST] [ALICE] Message sent")
        await new Promise(resolve => setTimeout(resolve, 1000))
        const messages = await messagesPromise
        expect(messages).toBeDefined()
        const stringifiedMessages = messages.toString("utf-8")
        console.log("[IM-TEST] [BOB] Decrypted message from alice: ", stringifiedMessages)
        expect(stringifiedMessages).toBe(message)
        // Bob sends a message to alice and alice receives it
        const messagesPromiseAlice = alice.awaitResponse<Buffer>("message") // NOTE Setting up a promise to receive the message as we don't know when it will arrive
        const messageAlice = "Hello from bob!"
        console.log("[IM-TEST] [BOB] Sending message to alice: ", messageAlice)
        await bob.sendMessage("alice", messageAlice)
        console.log("[IM-TEST] [BOB] Message sent")
        await new Promise(resolve => setTimeout(resolve, 1000))
        const messagesAlice = await messagesPromiseAlice
        expect(messagesAlice).toBeDefined()
        const stringifiedMessagesAlice = messagesAlice.toString("utf-8")
        console.log("[IM-TEST] [ALICE] Decrypted message from bob: ", stringifiedMessagesAlice)
        expect(stringifiedMessagesAlice).toBe(messageAlice)
    })
})
