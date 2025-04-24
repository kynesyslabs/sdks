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
 * Request-Response Pattern:
 * - The class provides a robust request-response pattern through the sendToServerAndWait method
 * - This method sends a message to the server and waits for a specific response type
 * - It supports custom error handling, retry logic, and filtering by additional criteria
 * - Example usage:
 *   ```typescript
 *   // Basic usage
 *   const response = await peer.sendToServerAndWait(
 *     {
 *       type: "custom_action",
 *       payload: { someData: "value" }
 *     },
 *     "custom_action_success"
 *   );
 *
 *   // With retry logic
 *   const response = await peer.sendToServerAndWait(
 *     {
 *       type: "custom_action",
 *       payload: { someData: "value" }
 *     },
 *     "custom_action_success",
 *     {
 *       retryCount: 3,
 *       timeout: 5000
 *     }
 *   );
 *   ```
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
export interface MessagingPeerConfig {
    serverUrl: string
    clientId: string
    publicKey: Uint8Array
}

export interface SerializedEncryptedObject {
    algorithm: "ml-kem-aes" | "rsa"
    serializedEncryptedData: string
    serializedCipherText?: string
}

export interface Message {
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
    public ws: WebSocket | null = null
    private config: MessagingPeerConfig
    private messageHandlers: Set<MessageHandler> = new Set()
    private errorHandlers: Set<ErrorHandler> = new Set()
    private peerDisconnectedHandlers: Set<PeerDisconnectedHandler> = new Set()
    private connectionStateHandlers: Set<ConnectionStateHandler> = new Set()
    private connectedPeers: Set<string> = new Set()
    private messageQueue: Message[] = []
    public isConnected = false
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
        console.log(
            "[IM @ " + this.config.clientId + "] Connecting to the server",
            this.config.serverUrl,
        )
        return new Promise((resolve, reject) => {
            try {
                this.connectWebSocket()
                this.reconnectAttempts = 0

                // Wait for the WebSocket to connect and register
                const checkConnection = setInterval(() => {
                    if (this.isConnected) {
                        clearInterval(checkConnection)
                        // Now wait for registration confirmation
                        this.registerAndWait()
                            .then(() => {
                                console.log(
                                    "[IM @ " +
                                        this.config.clientId +
                                        "] Connection and registration complete",
                                )
                                resolve()
                            })
                            .catch(error => {
                                console.error(
                                    "[IM @ " +
                                        this.config.clientId +
                                        "] Registration failed",
                                    error,
                                )
                                reject(error)
                            })
                    }
                }, 100)

                // Set a timeout for the connection
                setTimeout(() => {
                    clearInterval(checkConnection)
                    if (!this.isConnected) {
                        reject(new Error("Connection timeout"))
                    }
                }, 10000)
            } catch (error) {
                console.error(
                    "[IM @ " +
                        this.config.clientId +
                        "] Error connecting to the server",
                    error,
                )
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
            console.log(
                "[IM @ " + this.config.clientId + "] Connected to the server",
            )
            this.isConnected = true
            this.isReconnecting = false
            this.reconnectAttempts = 0
            this.processMessageQueue()
            this.notifyConnectionState("connected")
        }

        this.ws.onclose = () => {
            console.log(
                "[IM @ " +
                    this.config.clientId +
                    "] Disconnected from the server",
            )
            this.isConnected = false
            this.connectedPeers.clear()
            this.notifyConnectionState("disconnected")
            this.attemptReconnect()
        }

        this.ws.onerror = error => {
            console.error(
                "[IM @ " + this.config.clientId + "] Error on the websocket",
                error,
            )
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
     * Awaits a response for a specific message type
     * @param messageType - The type of message to wait for
     * @param filterFn - Optional function to filter messages by additional criteria
     * @param timeout - Optional timeout in milliseconds (default: 10000)
     * @returns Promise that resolves with the message payload or rejects with an error
     */
    public async awaitResponse<T = any>(
        messageType: Message["type"],
        filterFn?: (message: Message) => boolean,
        timeout: number = 10000,
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            // Set a timeout to reject the promise if no response is received
            const timeoutId = setTimeout(() => {
                reject(
                    new Error(
                        `Timeout waiting for response of type: ${messageType}`,
                    ),
                )
            }, timeout)

            const handler = (message: any, fromId: string) => {
                // Convert to Message object if needed
                const msg =
                    message && typeof message === "object" && "type" in message
                        ? (message as Message)
                        : ({ type: "message", payload: message } as Message)

                if (msg.type === messageType && (!filterFn || filterFn(msg))) {
                    clearTimeout(timeoutId)
                    resolve(msg.payload as T)
                } else if (msg.type === "error") {
                    console.error(
                        "[IM @ " +
                            this.config.clientId +
                            "] Received an error message: ",
                        msg,
                    )
                    clearTimeout(timeoutId)
                    reject(new Error(msg.payload.details))
                }
            }

            this.addTemporaryMessageHandler(handler)
        })
    }

    /**
     * Registers the peer with the signaling server
     */
    public register(): void {
        this.sendToServer({
            type: "register",
            payload: {
                clientId: this.config.clientId,
                publicKey: Array.from(this.config.publicKey),
            },
        })
        console.log("[IM @ " + this.config.clientId + "] Register payload sent")
    }

    /**
     * Registers the peer with the signaling server and waits for confirmation
     * @returns Promise that resolves when registration is confirmed
     */
    public async registerAndWait(): Promise<void> {
        await this.sendToServerAndWait(
            {
                type: "register",
                payload: {
                    clientId: this.config.clientId,
                    publicKey: Array.from(this.config.publicKey),
                },
            },
            "register",
        )
        console.log(
            "[IM @ " + this.config.clientId + "] Registration confirmed",
        )
    }

    /**
     * Discovers all connected peers
     * @returns Promise that resolves with an array of peer IDs
     */
    public async discoverPeers(): Promise<string[]> {
        const response = await this.sendToServerAndWait<{ peers: string[] }>(
            {
                type: "discover",
                payload: {},
            },
            "discover",
        )

        this.connectedPeers = new Set(response.peers)
        return response.peers
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
        const bytesMessage = new TextEncoder().encode(message)
        const encryptedMessage: encryptedObject = await unifiedCrypto.encrypt(
            "ml-kem-aes",
            bytesMessage,
            targetPublicKey,
        )

        const serializedCipherText = this.serializeUint8Array(
            encryptedMessage.cipherText,
        )
        const serializedEncryptedData = this.serializeUint8Array(
            encryptedMessage.encryptedData,
        )
        const serializedEncryptedObject: SerializedEncryptedObject = {
            algorithm: "ml-kem-aes",
            serializedCipherText,
            serializedEncryptedData,
        }
        // Send the encrypted message to the target peer
        this.sendToServer({
            type: "message",
            payload: {
                targetId: targetId,
                message: serializedEncryptedObject,
            },
        })
    }

    /**
     * Requests a peer's public key
     * @param peerId - The ID of the peer whose public key to request
     * @returns Promise that resolves with the peer's public key
     */
    public async requestPublicKey(peerId: string): Promise<Uint8Array> {
        const response = await this.sendToServerAndWait<{
            peerId: string
            publicKey: number[]
        }>(
            {
                type: "request_public_key",
                payload: {
                    targetId: peerId,
                },
            },
            "public_key_response",
            {
                filterFn: message => message.payload.peerId === peerId,
            },
        )

        return new Uint8Array(response.publicKey)
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
     * Sends a message to the server and waits for a specific response type
     * @param message - The message to send
     * @param expectedResponseType - The type of response to wait for
     * @param options - Additional options for handling the response
     * @returns Promise that resolves with the response payload or rejects with an error
     */
    public async sendToServerAndWait<T = any>(
        message: Message,
        expectedResponseType: Message["type"],
        options: {
            timeout?: number
            errorHandler?: (error: any) => void
            retryCount?: number
            filterFn?: (message: Message) => boolean
        } = {},
    ): Promise<T> {
        const {
            timeout = 10000,
            errorHandler,
            retryCount = 0,
            filterFn,
        } = options

        try {
            // Send the message
            this.sendToServer(message)

            // Wait for the response
            return await this.awaitResponse<T>(
                expectedResponseType,
                filterFn,
                timeout,
            )
        } catch (error) {
            // Custom error handling
            if (errorHandler) {
                errorHandler(error)
            }

            // Retry logic if needed
            if (retryCount > 0) {
                console.log(
                    `[IM] Retrying message (${retryCount} attempts remaining)...`,
                )
                return this.sendToServerAndWait(message, expectedResponseType, {
                    ...options,
                    retryCount: retryCount - 1,
                })
            }

            throw error
        }
    }

    /**
     * Handles incoming messages from the signaling server
     * @param message - The received message
     */
    private handleMessage(message: Message): void {
        switch (message.type) {
            case "message":
                console.log(
                    "[IM @ " +
                        this.config.clientId +
                        "] Received an encrypted message",
                )
                //console.log(message)
                // Decrypt the message using ml-kem-aes before passing to handlers
                const serializedEncryptedMessage = message.payload // REVIEW Safeguard this?
                    .message as SerializedEncryptedObject // REVIEW Safeguard this?

                const cipherText = this.deserializeUint8Array(
                    serializedEncryptedMessage.serializedCipherText,
                )
                const encryptedData = this.deserializeUint8Array(
                    serializedEncryptedMessage.serializedEncryptedData,
                )
                const encryptedMessage: encryptedObject = {
                    algorithm: serializedEncryptedMessage.algorithm,
                    cipherText,
                    encryptedData,
                }

                // NOTE When we receive a message, we need to decrypt it before passing it to the message handlers
                // This is an async operation, so we need to handle it properly
                console.log(
                    "[IM @ " + this.config.clientId + "] Decrypting message:",
                )

                const decryptedMessage = unifiedCrypto
                    .decrypt(encryptedMessage)
                    .then(decryptedMessage => {
                        console.log(
                            "[IM @ " +
                                this.config.clientId +
                                "] Decrypted message: ",
                            decryptedMessage,
                        )
                        // NOTE If something is added here, it will be executed for every message
                        // Below are the user-defined message handlers (through peer.onMessage)
                        this.messageHandlers.forEach(handler => {
                            handler(decryptedMessage, message.payload.fromId)
                        })
                    })

                break
            case "register":
                // Handle registration response
                console.log(
                    "[IM @ " +
                        this.config.clientId +
                        "] Received registration response:",
                    message.payload,
                )
                // Pass the message to any temporary handlers waiting for this response
                this.messageHandlers.forEach(handler => {
                    handler(message, "")
                })
                break
            case "peer_disconnected":
                this.connectedPeers.delete(message.payload.peerId)
                this.peerDisconnectedHandlers.forEach(handler => {
                    handler(message.payload.peerId)
                })
                break
            /*case "error":
                console.error("[IM @ " + this.config.clientId + "] Received an error message: ", message)
                this.handleError({
                    type: message.payload.errorType,
                    details: message.payload.details,
                })
                break*/
            default:
                console.info(
                    "[IM @ " + this.config.clientId + "] Received a message: ",
                )
                console.log(message.type)
                // Pass the message to any temporary handlers waiting for this response
                this.messageHandlers.forEach(handler => {
                    handler(message, "")
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
        handler: (message: any, fromId: string) => void,
    ): void {
        const tempHandler = (message: any, fromId: string) => {
            // If the message is a Message object, pass it directly
            if (message && typeof message === "object" && "type" in message) {
                handler(message as Message, fromId)
            } else {
                // Otherwise, create a Message object from the data
                handler(
                    {
                        type: "message",
                        payload: message,
                    } as Message,
                    fromId,
                )
            }
            this.removeMessageHandler(tempHandler)
        }
        this.messageHandlers.add(tempHandler)
    }

    /**
     * Process queued messages
     */
    private processMessageQueue(): void {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift()
            if (message) {
                this.sendToServer(message)
            }
        }
    }

    private serializeUint8Array(u8: Uint8Array): string {
        // TODO Implement this
        // Convert to binary string
        const binary = String.fromCharCode(...u8)
        // Convert binary string to Base64
        return btoa(binary)
    }

    private deserializeUint8Array(base64: string): Uint8Array {
        // TODO Implement this
        // Decode Base64 to binary string
        const binary = atob(base64)
        // Convert binary string to Uint8Array
        const len = binary.length
        const u8 = new Uint8Array(len)
        for (let i = 0; i < len; i++) {
            u8[i] = binary.charCodeAt(i)
        }
        return u8
    }
}
