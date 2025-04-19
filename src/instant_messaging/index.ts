/**
 * MessagingPeer class for peer-to-peer communication through a signaling server
 *
 * This class handles:
 * - Connection to signaling server
 * - Peer registration with public key
 * - Peer discovery
 * - Message exchange with other peers
 * - Public key requests
 * - Automatic reconnection with exponential backoff
 *
 * Message Handling:
 * - Messages are automatically encrypted when sent and decrypted when received
 * - To handle incoming messages with type "message", register a handler using onMessage:
 *   ```typescript
 *   peer.onMessage((message, fromId) => {
 *     // Handle the decrypted message here
 *     console.log(`Message from ${fromId}:`, message);
 *   });
 *   ```
 * - You can register multiple handlers for different purposes (each handler will receive the decrypted message and sender's ID)
 * - Handlers are executed in the order they are registered
 * - If no handlers are registered, messages will be silently ignored
 * - For request-response patterns (like getting a peer's public key), use the Promise-based methods
 *   that handle the response matching automatically
 *
 * Message Types:
 * - "message": Encrypted peer-to-peer messages
 *   ```typescript
 *   // Example of a received message payload
 *   {
 *     type: "message",
 *     payload: {
 *       message: {
 *         algorithm: "ml-kem-aes",
 *         encryptedData: Uint8Array,
 *         cipherText: Uint8Array
 *       },
 *       fromId: "sender-peer-id"
 *     }
 *   }
 *
 *   // After decryption, handlers receive:
 *   // message = "Hello, this is the decrypted message"
 *   // fromId = "sender-peer-id"
 *   ```
 *
 * Complete Example: Building a barebone messenger app and handling incoming messages
 * ```typescript
 * // In your application file (e.g., myMessenger.ts)
 * import { MessagingPeer } from './path/to/instant_messaging';
 *
 * // Create a peer instance
 * const peer = new MessagingPeer({
 *   serverUrl: 'ws://your-signaling-server:3000',
 *   clientId: 'your-unique-id',
 *   publicKey: yourPublicKey // Your ml-kem public key
 * });
 *
 * // Connect to the server
 * await peer.connect();
 *
 * // Register a handler for incoming messages
 * peer.onMessage((message, fromId) => {
 *   // Print the message to the console
 *   console.log(`Message from ${fromId}:`, message);
 *
 *   // If you're building a UI, you might update the DOM:
 *   const messageElement = document.createElement('div');
 *   messageElement.textContent = `${fromId}: ${message}`;
 *   document.getElementById('messages-container').appendChild(messageElement);
 * });
 *
 * // Discover other peers
 * const peers = await peer.discoverPeers();
 * console.log('Available peers:', peers);
 *
 * // Send a message to a specific peer
 * await peer.sendMessage('target-peer-id', 'Hello from me!');
 * ```
 *
 * Usage:
 * ```typescript
 * const peer = new MessagingPeer({
 *   serverUrl: 'ws://localhost:3000',
 *   clientId: 'unique-id',
 *   publicKey: a ml-kem public key
 * });
 *
 * // Connect and register
 * await peer.connect();
 *
 * // Discover other peers
 * const peers = await peer.discoverPeers();
 *
 * // Send a message
 * await peer.sendMessage('target-peer-id', 'Hello!');
 *
 * // Listen for messages
 * peer.onMessage((message, fromId) => {
 *   console.log(`Message from ${fromId}:`, message);
 * });
 * ```
 */

import { unifiedCrypto, encryptedObject } from "@/encryption/unifiedCrypto"
interface MessagingPeerConfig {
    serverUrl: string
    clientId: string
    publicKey: Uint8Array
}

interface Message {
    type:
        | "register"
        | "discover"
        | "message"
        | "peer_disconnected"
        | "request_public_key"
        | "public_key_response"
        | "error"
    payload: any
}

type MessageHandler = (message: any, fromId: string) => void
type ErrorHandler = (error: { type: string; details: string }) => void
type PeerDisconnectedHandler = (peerId: string) => void
type ConnectionStateHandler = (
    state: "connected" | "disconnected" | "reconnecting",
) => void

export class MessagingPeer {
    private ws: WebSocket | null = null
    private config: MessagingPeerConfig
    private messageHandlers: Set<MessageHandler> = new Set()
    private errorHandlers: Set<ErrorHandler> = new Set()
    private peerDisconnectedHandlers: Set<PeerDisconnectedHandler> = new Set()
    private connectionStateHandlers: Set<ConnectionStateHandler> = new Set()
    private connectedPeers: Set<string> = new Set()
    private messageQueue: Message[] = []
    private isConnected = false
    private reconnectAttempts = 0
    private maxReconnectAttempts = 10
    private baseReconnectDelay = 1000 // 1 second
    private reconnectTimeout: NodeJS.Timeout | null = null
    private isReconnecting = false

    constructor(config: MessagingPeerConfig) {
        this.config = config
    }

    /**
     * Connects to the signaling server and registers the peer
     * @returns Promise that resolves when connected and registered
     */
    public async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.connectWebSocket()
                this.reconnectAttempts = 0
                resolve()
            } catch (error) {
                reject(error)
            }
        })
    }

    /**
     * Establishes WebSocket connection and sets up event handlers
     */
    private connectWebSocket(): void {
        if (this.ws) {
            this.ws.close()
        }

        this.ws = new WebSocket(this.config.serverUrl)
        this.isReconnecting = true
        this.notifyConnectionState("reconnecting")

        this.ws.onopen = () => {
            this.isConnected = true
            this.isReconnecting = false
            this.reconnectAttempts = 0
            this.register()
            this.processMessageQueue()
            this.notifyConnectionState("connected")
        }

        this.ws.onclose = () => {
            this.isConnected = false
            this.connectedPeers.clear()
            this.notifyConnectionState("disconnected")
            this.attemptReconnect()
        }

        this.ws.onerror = error => {
            this.handleError({
                type: "CONNECTION_ERROR",
                details:
                    error instanceof Error
                        ? error.message
                        : "WebSocket connection error",
            })
        }

        this.ws.onmessage = event => {
            this.handleMessage(JSON.parse(event.data))
        }
    }

    /**
     * Attempts to reconnect to the server with exponential backoff
     */
    private attemptReconnect(): void {
        if (
            this.reconnectAttempts >= this.maxReconnectAttempts ||
            !this.isReconnecting
        ) {
            return
        }

        const delay = Math.min(
            this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
            30000, // Max delay of 30 seconds
        )

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectAttempts++
            this.connectWebSocket()
        }, delay)
    }

    /**
     * Registers the peer with the signaling server
     */
    private register() {
        this.sendToServer({
            type: "register",
            payload: {
                clientId: this.config.clientId,
                publicKey: Array.from(this.config.publicKey),
            },
        })
    }

    /**
     * Discovers all connected peers
     * @returns Promise that resolves with an array of peer IDs
     */
    public async discoverPeers(): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const messageId = Date.now().toString()
            const handler = (message: Message) => {
                if (message.type === "discover") {
                    this.connectedPeers = new Set(message.payload.peers)
                    resolve(message.payload.peers)
                } else if (message.type === "error") {
                    reject(new Error(message.payload.details))
                }
            }

            this.addTemporaryMessageHandler(handler)
            this.sendToServer({
                type: "discover",
                payload: {},
            })
        })
    }

    /**
     * Sends a message to a specific peer
     * @param targetId - The ID of the target peer
     * @param message - The message to send
     */
    public async sendMessage(targetId: string, message: string): Promise<void> {
        // Get the target peer's public key
        // REVIEW Error handling if it fails?
        const targetPublicKey = await this.requestPublicKey(targetId)

        // Encrypt the message using ml-kem-aes
        // NOTE This assumes that we have already exchanged public keys with the target peer
        // REVIEW Is the Ucrypto system in place for this? Aka we have a valid id? We are in the sdk so we should ensure this
        const bytesMessage = new TextEncoder().encode(message)
        const encryptedMessage: encryptedObject = await unifiedCrypto.encrypt(
            "ml-kem-aes",
            bytesMessage,
            targetPublicKey,
        )

        // Send the encrypted message to the target peer
        this.sendToServer({
            type: "message",
            payload: {
                targetId: targetId,
                message: encryptedMessage,
            },
        })
    }

    /**
     * Requests a peer's public key
     * @param peerId - The ID of the peer whose public key to request
     * @returns Promise that resolves with the peer's public key
     */
    public async requestPublicKey(peerId: string): Promise<Uint8Array> {
        return new Promise((resolve, reject) => {
            const handler = (message: Message) => {
                if (
                    message.type === "public_key_response" &&
                    message.payload.peerId === peerId
                ) {
                    resolve(new Uint8Array(message.payload.publicKey))
                } else if (message.type === "error") {
                    reject(new Error(message.payload.details))
                }
            }

            this.addTemporaryMessageHandler(handler)
            this.sendToServer({
                type: "request_public_key",
                payload: {
                    targetId: peerId,
                },
            })
        })
    }

    /**
     * Adds a handler for incoming messages
     * @param handler - Function to call when a message is received
     */
    public onMessage(handler: MessageHandler): void {
        this.messageHandlers.add(handler)
    }

    /**
     * Adds a handler for errors
     * @param handler - Function to call when an error occurs
     */
    public onError(handler: ErrorHandler): void {
        this.errorHandlers.add(handler)
    }

    /**
     * Adds a handler for peer disconnection events
     * @param handler - Function to call when a peer disconnects
     */
    public onPeerDisconnected(handler: PeerDisconnectedHandler): void {
        this.peerDisconnectedHandlers.add(handler)
    }

    /**
     * Adds a handler for connection state changes
     * @param handler - Function to call when connection state changes
     */
    public onConnectionStateChange(handler: ConnectionStateHandler): void {
        this.connectionStateHandlers.add(handler)
    }

    /**
     * Removes a message handler
     * @param handler - The handler to remove
     */
    public removeMessageHandler(handler: MessageHandler): void {
        this.messageHandlers.delete(handler)
    }

    /**
     * Removes an error handler
     * @param handler - The handler to remove
     */
    public removeErrorHandler(handler: ErrorHandler): void {
        this.errorHandlers.delete(handler)
    }

    /**
     * Removes a peer disconnected handler
     * @param handler - The handler to remove
     */
    public removePeerDisconnectedHandler(
        handler: PeerDisconnectedHandler,
    ): void {
        this.peerDisconnectedHandlers.delete(handler)
    }

    /**
     * Removes a connection state change handler
     * @param handler - The handler to remove
     */
    public removeConnectionStateHandler(handler: ConnectionStateHandler): void {
        this.connectionStateHandlers.delete(handler)
    }

    /**
     * Closes the connection to the signaling server
     */
    public disconnect(): void {
        this.isReconnecting = false
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout)
            this.reconnectTimeout = null
        }
        if (this.ws) {
            this.ws.close()
            this.ws = null
            this.isConnected = false
            this.connectedPeers.clear()
            this.notifyConnectionState("disconnected")
        }
    }

    /**
     * Sends a message to the signaling server
     * @param message - The message to send
     */
    private sendToServer(message: Message): void {
        if (!this.ws || !this.isConnected) {
            this.messageQueue.push(message)
            return
        }

        try {
            this.ws.send(JSON.stringify(message))
        } catch (error) {
            this.handleError({
                type: "SEND_ERROR",
                details:
                    error instanceof Error
                        ? error.message
                        : "Failed to send message",
            })
        }
    }

    /**
     * Processes queued messages
     */
    private processMessageQueue(): void {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift()
            if (message) {
                this.sendToServer(message)
            }
        }
    }

    /**
     * Handles incoming messages from the signaling server
     * @param message - The received message
     */
    private handleMessage(message: Message): void {
        switch (message.type) {
            case "message":
                // TODO: Decrypt the message using ml-kem-aes before passing to handlers
                // REVIEW The message's payload should be {
                //     message: payload.message as encryptedObject,
                //     fromId: senderId,
                // },
                const encryptedMessage = message.payload
                    .message as encryptedObject // REVIEW Safeguard this?
                // NOTE When we receive a message, we need to decrypt it before passing it to the message handlers
                // This is an async operation, so we need to handle it properly
                const decryptedMessage = unifiedCrypto
                    .decrypt(encryptedMessage)
                    .then(decryptedMessage => {
                        // NOTE If something is added here, it will be executed for every message
                        // Below are the user-defined message handlers (through peer.onMessage)
                        this.messageHandlers.forEach(handler => {
                            handler(decryptedMessage, message.payload.fromId)
                        })
                    })

                break
            case "peer_disconnected":
                this.connectedPeers.delete(message.payload.peerId)
                this.peerDisconnectedHandlers.forEach(handler => {
                    handler(message.payload.peerId)
                })
                break
            case "error":
                this.handleError({
                    type: message.payload.errorType,
                    details: message.payload.details,
                })
                break
        }
    }

    /**
     * Handles errors
     * @param error - The error to handle
     */
    private handleError(error: { type: string; details: string }): void {
        this.errorHandlers.forEach(handler => {
            handler(error)
        })
    }

    /**
     * Notifies connection state change handlers
     * @param state - The new connection state
     */
    private notifyConnectionState(
        state: "connected" | "disconnected" | "reconnecting",
    ): void {
        this.connectionStateHandlers.forEach(handler => {
            handler(state)
        })
    }

    /**
     * Adds a temporary message handler that will be removed after handling one message
     * @param handler - The temporary handler to add
     */
    private addTemporaryMessageHandler(
        handler: (message: Message) => void,
    ): void {
        const tempHandler = (message: Message) => {
            handler(message)
            this.removeMessageHandler(tempHandler)
        }
        this.messageHandlers.add(tempHandler)
    }
}
