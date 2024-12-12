// extends L2PS to add messaging system
import L2PS from "./L2PS"

// Message structure
export type Message = {
    messageId: string
    sender: string
    receiver: string
    message: string
    timestamp: number
}

// Message Map
export type MessageMap = Map<string, Message> // messageId -> Message

