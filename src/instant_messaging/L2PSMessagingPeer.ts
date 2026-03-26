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
    requestId?: string
}

/** Discriminated union of all server→client payloads */
type ServerPayload =
    | RegisteredResponse["payload"]
    | IncomingMessage["payload"]
    | MessageSentResponse["payload"]
    | MessageQueuedResponse["payload"]
    | HistoryResponse["payload"]
    | DiscoverResponse["payload"]
    | PublicKeyResponse["payload"]
    | PeerJoinedNotification["payload"]
    | PeerLeftNotification["payload"]
    | ErrorResponse["payload"]

interface IncomingFrame {
    type: ServerMessageType
    payload: ServerPayload
    timestamp: number
    requestId?: string
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
    // REVIEW: resolve accepts ServerPayload (widened from generic T) because the map is homogeneous
    private pendingResponses: Map<
        string,
        { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout; _meta?: PendingMeta }
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
    private isReconnecting = false

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
            let checkOpen: NodeJS.Timeout | null = null

            const timeout = setTimeout(() => {
                if (checkOpen) {
                    clearInterval(checkOpen)
                }
                this.shouldReconnect = false
                if (this.ws) {
                    this.ws.close()
                }
                reject(new Error("Connection timeout (10s)"))
            }, 10000)

            this.shouldReconnect = true
            this.connectWebSocket()

            // Wait for WS open, then register
            checkOpen = setInterval(() => {
                if (this._isConnected) {
                    clearInterval(checkOpen!)
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

        const requestId = this.generateRequestId()
        this.sendFrame({
            type: "send",
            payload: { to, encrypted, messageHash },
            timestamp: Date.now(),
            requestId,
        })

        // Wait for either message_sent or message_queued
        return this.waitForResponse<MessageSentResponse["payload"] | MessageQueuedResponse["payload"]>(
            requestId,
            ["message_sent", "message_queued"],
            15000,
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

        const requestId = this.generateRequestId()
        this.sendFrame({
            type: "history",
            payload: {
                peerKey,
                before: options.before,
                limit: options.limit,
                proof,
            },
            timestamp,
            requestId,
        })

        return this.waitForResponse<HistoryResponse["payload"]>(
            requestId,
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

        const requestId = this.generateRequestId()
        this.sendFrame({
            type: "discover",
            payload: {},
            timestamp: Date.now(),
            requestId,
        })

        const response = await this.waitForResponse<DiscoverResponse["payload"]>(
            requestId,
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

        const requestId = this.generateRequestId()
        this.sendFrame({
            type: "request_public_key",
            payload: { targetId },
            timestamp: Date.now(),
            requestId,
        })

        const response = await this.waitForResponse<PublicKeyResponse["payload"]>(
            requestId,
            ["public_key_response"],
            10000,
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

        this.ws.onopen = async () => {
            this._isConnected = true
            this.reconnectAttempts = 0

            // Attempt re-registration if this is a reconnection (not initial connection)
            if (this.isReconnecting) {
                try {
                    await this.register()
                    this.notifyConnectionState("connected")
                    this.flushQueue()
                    this.isReconnecting = false
                } catch (err) {
                    // Re-registration failed — notify error handlers and retry
                    this.errorHandlers.forEach(h =>
                        h({ code: "INTERNAL_ERROR" as ErrorCode, message: "Re-registration failed after reconnect", details: err instanceof Error ? err.message : "unknown" }),
                    )
                    this._isConnected = false
                    this._isRegistered = false
                    this.notifyConnectionState("disconnected")
                    if (this.ws) {
                        this.ws.close()
                    }
                    if (this.shouldReconnect) {
                        this.attemptReconnect()
                    }
                }
            } else {
                // Initial connection, registration will be handled by connect()
                this.notifyConnectionState("connected")
                this.flushQueue()
            }
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
                h({ code: "INTERNAL_ERROR" as ErrorCode, message: "WebSocket error", details: event instanceof Error ? event.message : "unknown" }),
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

        this.isReconnecting = true
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

        const requestId = this.generateRequestId()
        this.sendFrame({
            type: "register",
            payload: {
                publicKey: this.config.publicKey,
                l2psUid: this.config.l2psUid,
                proof,
            },
            timestamp,
            requestId,
        })

        const response = await this.waitForResponse<RegisteredResponse["payload"]>(
            requestId,
            ["registered"],
            10000,
        )

        this._isRegistered = true
        this.onlinePeers = new Set(response.onlinePeers)
        return response
    }

    // ─── Private: Frame Handling ─────────────────────────────────

    private handleFrame(frame: IncomingFrame): void {
        // First, check if any pending response matches by requestId
        if (frame.requestId && this.pendingResponses.has(frame.requestId)) {
            const pending = this.pendingResponses.get(frame.requestId)!
            const meta = pending._meta
            if (meta && meta.types.includes(frame.type)) {
                clearTimeout(pending.timer)
                this.pendingResponses.delete(frame.requestId)
                pending.resolve(frame.payload)
                return
            }
        }

        // Handle error frames with requestId
        if (frame.type === "error" && frame.requestId && this.pendingResponses.has(frame.requestId)) {
            const pending = this.pendingResponses.get(frame.requestId)!
            clearTimeout(pending.timer)
            this.pendingResponses.delete(frame.requestId)
            pending.reject(new Error((frame.payload as ErrorResponse["payload"])?.message || "Server error"))
            return
        }

        // Then dispatch to event handlers
        switch (frame.type) {
            case "message": {
                const p = frame.payload as IncomingMessage["payload"]
                this.messageHandlers.forEach(h => h(p))
                break
            }
            case "peer_joined": {
                const p = frame.payload as PeerJoinedNotification["payload"]
                this.onlinePeers.add(p.publicKey)
                this.peerJoinedHandlers.forEach(h => h(p.publicKey))
                break
            }
            case "peer_left": {
                const p = frame.payload as PeerLeftNotification["payload"]
                this.onlinePeers.delete(p.publicKey)
                this.peerLeftHandlers.forEach(h => h(p.publicKey))
                break
            }
            case "error": {
                const p = frame.payload as ErrorResponse["payload"]
                this.errorHandlers.forEach(h => h(p))
                break
            }
            default:
                // message_sent, message_queued etc. without a waiter — ignore
                break
        }
    }

    // ─── Private: Request-Response ───────────────────────────────

    private waitForResponse<T>(
        requestId: string,
        expectedTypes: ServerMessageType[],
        timeoutMs: number,
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingResponses.delete(requestId)
                reject(new Error(`Timeout waiting for ${expectedTypes.join("|")} (${timeoutMs}ms)`))
            }, timeoutMs)

            this.pendingResponses.set(requestId, {
                resolve: resolve as (value: unknown) => void,
                reject,
                timer,
                _meta: { types: expectedTypes },
            })
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

    private generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
    }
}

/** Internal metadata attached to pending response entries */
interface PendingMeta {
    types: ServerMessageType[]
}