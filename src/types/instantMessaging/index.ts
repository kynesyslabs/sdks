export interface InstantMessagingPayload {
    type: "instantMessaging"
    data: {
        targetId: string
        senderId: string
        messageHash: string
    }
}
