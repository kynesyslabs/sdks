export interface InstantMessagingPayload {
    type: "instantMessaging"
    data: {
        targetId: string
        senderId: string
        messageHash: string
    }
}

/** L2PS-backed instant messaging transaction payload */
export interface L2PSInstantMessagingPayload {
    type: "instantMessaging"
    data: {
        /** UUID v4 message identifier */
        messageId: string
        /** SHA256 hash for dedup */
        messageHash: string
        /** E2E encrypted message (serialized) */
        encrypted: {
            ciphertext: string
            nonce: string
            ephemeralKey?: string
        }
        /** Unix timestamp (ms) */
        timestamp: number
    }
}
