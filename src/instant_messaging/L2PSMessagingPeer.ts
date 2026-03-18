/**
 * L2PSMessagingPeer - WebSocket client for L2PS-backed instant messaging
 *
 * Connects to the L2PS messaging server (default port 3006) and provides:
 * - Registration with ed25519 proof and L2PS network isolation
 * - E2E encrypted message sending/receiving
 * - Conversation history with pagination
 * - Peer discovery within L2PS network
 * - Offline message delivery
 * - Automatic reconnection with exponential backoff
 */

import type {
    SerializedEncryptedMessage,
    ClientMessageType,
    ServerMessageType,
    RegisteredResponse,
    IncomingMessage,
    MessageSentResponse,
    MessageQueuedResponse,
    HistoryResponse,
    DiscoverResponse,
    PublicKeyResponse,
    PeerJoinedNotification,
    PeerLeftNotification,
    ErrorResponse,
    ErrorCode,
    StoredMessage,
} from "./l2ps_types"

// ─── Config & Handler Types ──────────────────────────────────────

export interface L2PSMessagingConfig {
    /** WebSocket URL of the L2PS messaging server (e.g. "ws://localhost:3006") */
    serverUrl: string
    /** Client's ed25519 public key (hex string, 64+ chars) */
    publicKey: string
    /** L2PS network UID to join */
    l2psUid: string
    /** Function to sign proof strings with ed25519 private key. Returns hex signature. */
    signFn: (message: string) => Promise<string> | string
}

export type L2PSMessageHandler = (message: IncomingMessage["payload"]) => void
export type L2PSErrorHandler = (error: ErrorResponse["payload"]) => void
export type L2PSPeerHandler = (publicKey: string) => void
export type L2PSConnectionStateHandler = (state: "connected" | "disconnected" | "reconnecting") => void

// ─── Internal protocol frame ────────────────────────────────────

interface OutgoingFrame {
    type: ClientMessageType
    payload: Record<string, unknown>
    timestamp: number
}

interface IncomingFrame {
    type: ServerMessageType
    payload: any
    timestamp: number
}

// ─── Client Class ────────────────────────────────────────────────

export class L2PSMessagingPeer {
    private ws: WebSocket | null = null
    private config: L2PSMessagingConfig

    // Event handlers
    private messageHandlers: Set<L2PSMessageHandler> = new Set()
    private errorHandlers: Set<L2PSErrorHandler> = new Set()
    private peerJoinedHandlers: Set<L2PSPeerHandler> = new Set()
    private peerLeftHandlers: Set<L2PSPeerHandler> = new Set()
    private connectionStateHandlers: Set<L2PSConnectionStateHandler> = new Set()

    // Pending request-response waiters
    private pendingResponses: Map<
        string,
        { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
    > = new Map()

    // State
    private _isConnected = false
    private _isRegistered = false
    private onlinePeers: Set<string> = new Set()
    private messageQueue: OutgoingFrame[] = []

    // Reconnection
    private reconnectAttempts = 0
    private maxReconnectAttempts = 10
    private baseReconnectDelay = 1000
    private reconnectTimeout: NodeJS.Timeout | null = null
    private shouldReconnect = true

    constructor(config: L2PSMessagingConfig) {
        this.config = config
    }

    // ─── Public Getters ──────────────────────────────────────────

    get isConnected(): boolean {
        return this._isConnected
    }

    get isRegistered(): boolean {
        return this._isRegistered
    }

    get peers(): string[] {
        return Array.from(this.onlinePeers)
    }

    // ─── Connection Lifecycle ────────────────────────────────────

    /**
     * Connect to L2PS messaging server and register
     * @returns Registration response with online peers
     */
    async connect(): Promise<RegisteredResponse["payload"]> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Connection timeout (10s)"))
            }, 10000)

            this.shouldReconnect = true
            this.connectWebSocket()

            // Wait for WS open, then register
            const checkOpen = setInterval(() => {
                if (this._isConnected) {
                    clearInterval(checkOpen)
                    this.register()
                        .then(response => {
                            clearTimeout(timeout)
                            resolve(response)
                        })
                        .catch(err => {
                            clearTimeout(timeout)
                            reject(err)
                        })
                }
            }, 50)
        })
    }

    /** Disconnect from the server */
    disconnect(): void {
        this.shouldReconnect = false
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout)
            this.reconnectTimeout = null
        }
        // Reject all pending responses
        for (const [key, pending] of this.pendingResponses) {
            clearTimeout(pending.timer)
            pending.reject(new Error("Disconnected"))
        }
        this.pendingResponses.clear()

        if (this.ws) {
            this.ws.close()
            this.ws = null
        }
        this._isConnected = false
        this._isRegistered = false
        this.onlinePeers.clear()
        this.notifyConnectionState("disconnected")
    }

    // ─── Messaging API ───────────────────────────────────────────

    /**
     * Send an encrypted message to a peer
     * @param to - Recipient's public key (hex)
     * @param encrypted - E2E encrypted message
     * @param messageHash - SHA256 hash for dedup
     * @returns Delivery confirmation (sent or queued)
     */
    async send(
        to: string,
        encrypted: SerializedEncryptedMessage,
        messageHash: string,
    ): Promise<MessageSentResponse["payload"] | MessageQueuedResponse["payload"]> {
        this.ensureRegistered()

        this.sendFrame({
            type: "send",
            payload: { to, encrypted, messageHash },
            timestamp: Date.now(),
        })

        // Wait for either message_sent or message_queued
        return this.waitForResponse<MessageSentResponse["payload"] | MessageQueuedResponse["payload"]>(
            `send:${messageHash}`,
            ["message_sent", "message_queued"],
            15000,
            (frame: IncomingFrame) =>
                frame.payload?.messageHash === messageHash,
        )
    }

    /**
     * Get conversation history with a peer
     * @param peerKey - Peer's public key
     * @param options - Pagination options
     * @returns Message history with pagination info
     */
    async history(
        peerKey: string,
        options: { before?: number; limit?: number } = {},
    ): Promise<HistoryResponse["payload"]> {
        this.ensureRegistered()

        const timestamp = Date.now()
        const proofString = `history:${peerKey}:${timestamp}`
        const proof = await this.config.signFn(proofString)

        this.sendFrame({
            type: "history",
            payload: {
                peerKey,
                before: options.before,
                limit: options.limit,
                proof,
            },
            timestamp,
        })

        return this.waitForResponse<HistoryResponse["payload"]>(
            `history:${peerKey}`,
            ["history_response"],
            10000,
        )
    }

    /**
     * Discover online peers in the L2PS network
     * @returns List of online peer public keys
     */
    async discover(): Promise<string[]> {
        this.ensureRegistered()

        this.sendFrame({
            type: "discover",
            payload: {},
            timestamp: Date.now(),
        })

        const response = await this.waitForResponse<DiscoverResponse["payload"]>(
            "discover",
            ["discover_response"],
            10000,
        )

        this.onlinePeers = new Set(response.peers)
        return response.peers
    }

    /**
     * Request a peer's public key
     * @param targetId - Target peer identifier
     * @returns Public key hex string or null if not found
     */
    async requestPublicKey(targetId: string): Promise<string | null> {
        this.ensureRegistered()

        this.sendFrame({
            type: "request_public_key",
            payload: { targetId },
            timestamp: Date.now(),
        })

        const response = await this.waitForResponse<PublicKeyResponse["payload"]>(
            `pubkey:${targetId}`,
            ["public_key_response"],
            10000,
            (frame: IncomingFrame) => frame.payload?.targetId === targetId,
        )

        return response.publicKey
    }

    // ─── Event Handlers ──────────────────────────────────────────

    onMessage(handler: L2PSMessageHandler): void {
        this.messageHandlers.add(handler)
    }

    onError(handler: L2PSErrorHandler): void {
        this.errorHandlers.add(handler)
    }

    onPeerJoined(handler: L2PSPeerHandler): void {
        this.peerJoinedHandlers.add(handler)
    }

    onPeerLeft(handler: L2PSPeerHandler): void {
        this.peerLeftHandlers.add(handler)
    }

    onConnectionStateChange(handler: L2PSConnectionStateHandler): void {
        this.connectionStateHandlers.add(handler)
    }

    removeMessageHandler(handler: L2PSMessageHandler): void {
        this.messageHandlers.delete(handler)
    }

    removeErrorHandler(handler: L2PSErrorHandler): void {
        this.errorHandlers.delete(handler)
    }

    removePeerJoinedHandler(handler: L2PSPeerHandler): void {
        this.peerJoinedHandlers.delete(handler)
    }

    removePeerLeftHandler(handler: L2PSPeerHandler): void {
        this.peerLeftHandlers.delete(handler)
    }

    removeConnectionStateHandler(handler: L2PSConnectionStateHandler): void {
        this.connectionStateHandlers.delete(handler)
    }

    // ─── Private: WebSocket ──────────────────────────────────────

    private connectWebSocket(): void {
        if (this.ws) {
            this.ws.close()
        }

        this.ws = new WebSocket(this.config.serverUrl)
        this.notifyConnectionState("reconnecting")

        this.ws.onopen = () => {
            this._isConnected = true
            this.reconnectAttempts = 0
            this.notifyConnectionState("connected")
            this.flushQueue()
        }

        this.ws.onclose = () => {
            this._isConnected = false
            this._isRegistered = false
            this.onlinePeers.clear()
            this.notifyConnectionState("disconnected")
            if (this.shouldReconnect) {
                this.attemptReconnect()
            }
        }

        this.ws.onerror = (event) => {
            this.errorHandlers.forEach(h =>
                h({ code: "INTERNAL_ERROR" as ErrorCode, message: "WebSocket error", details: String(event) }),
            )
        }

        this.ws.onmessage = (event) => {
            try {
                const frame: IncomingFrame = JSON.parse(
                    typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data),
                )
                this.handleFrame(frame)
            } catch {
                // Ignore unparseable frames
            }
        }
    }

    private attemptReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            return
        }

        const delay = Math.min(
            this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
            30000,
        )

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectAttempts++
            this.connectWebSocket()
        }, delay)
    }

    // ─── Private: Registration ───────────────────────────────────

    private async register(): Promise<RegisteredResponse["payload"]> {
        const timestamp = Date.now()
        const proofString = `register:${this.config.publicKey}:${timestamp}`
        const proof = await this.config.signFn(proofString)

        this.sendFrame({
            type: "register",
            payload: {
                publicKey: this.config.publicKey,
                l2psUid: this.config.l2psUid,
                proof,
            },
            timestamp,
        })

        const response = await this.waitForResponse<RegisteredResponse["payload"]>(
            "register",
            ["registered"],
            10000,
        )

        this._isRegistered = true
        this.onlinePeers = new Set(response.onlinePeers)
        return response
    }

    // ─── Private: Frame Handling ─────────────────────────────────

    private handleFrame(frame: IncomingFrame): void {
        // First, check if any pending response matches
        for (const [key, pending] of this.pendingResponses) {
            const meta = (pending as any)._meta as PendingMeta | undefined
            if (meta && meta.types.includes(frame.type)) {
                if (!meta.filterFn || meta.filterFn(frame)) {
                    clearTimeout(pending.timer)
                    this.pendingResponses.delete(key)
                    pending.resolve(frame.payload)
                    return
                }
            }
        }

        // Then dispatch to event handlers
        switch (frame.type) {
            case "message":
                this.messageHandlers.forEach(h => h(frame.payload))
                break
            case "peer_joined":
                this.onlinePeers.add(frame.payload.publicKey)
                this.peerJoinedHandlers.forEach(h => h(frame.payload.publicKey))
                break
            case "peer_left":
                this.onlinePeers.delete(frame.payload.publicKey)
                this.peerLeftHandlers.forEach(h => h(frame.payload.publicKey))
                break
            case "error":
                this.errorHandlers.forEach(h => h(frame.payload))
                break
            default:
                // message_sent, message_queued etc. without a waiter — ignore
                break
        }
    }

    // ─── Private: Request-Response ───────────────────────────────

    private waitForResponse<T>(
        key: string,
        expectedTypes: ServerMessageType[],
        timeoutMs: number,
        filterFn?: (frame: IncomingFrame) => boolean,
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingResponses.delete(key)
                reject(new Error(`Timeout waiting for ${expectedTypes.join("|")} (${timeoutMs}ms)`))
            }, timeoutMs)

            const entry = { resolve, reject, timer }
            // Attach metadata for matching
            ;(entry as any)._meta = { types: expectedTypes, filterFn } as PendingMeta
            this.pendingResponses.set(key, entry)
        })
    }

    // ─── Private: Sending ────────────────────────────────────────

    private sendFrame(frame: OutgoingFrame): void {
        if (!this.ws || !this._isConnected) {
            this.messageQueue.push(frame)
            return
        }

        try {
            this.ws.send(JSON.stringify(frame))
        } catch {
            this.messageQueue.push(frame)
        }
    }

    private flushQueue(): void {
        while (this.messageQueue.length > 0) {
            const frame = this.messageQueue.shift()
            if (frame) {
                this.sendFrame(frame)
            }
        }
    }

    // ─── Private: Guards ─────────────────────────────────────────

    private ensureRegistered(): void {
        if (!this._isRegistered) {
            throw new Error("Not registered. Call connect() first.")
        }
    }

    private notifyConnectionState(state: "connected" | "disconnected" | "reconnecting"): void {
        this.connectionStateHandlers.forEach(h => h(state))
    }
}

/** Internal metadata attached to pending response entries */
interface PendingMeta {
    types: ServerMessageType[]
    filterFn?: (frame: IncomingFrame) => boolean
}
