# MessagingPeer

A TypeScript class for peer-to-peer communication through a signaling server with automatic encryption/decryption.

## Design Overview

MessagingPeer provides a robust implementation for peer-to-peer communication with the following key features:

-   **WebSocket-based Signaling Server**: Facilitates peer discovery and message routing
-   **Automatic Encryption/Decryption**: Uses ml-kem-aes for secure message exchange
-   **Connection Management**: Handles connection, disconnection, and automatic reconnection
-   **Event-Based Architecture**: Uses handlers for different message types and events
-   **Promise-Based API**: For request-response patterns like peer discovery and public key exchange
-   **Robust Request-Response Pattern**: Built-in support for waiting for specific responses with retry logic
-   **Multi-Round Conversations**: Support for back-and-forth conversations between peers and the server

### Architecture

The system consists of:

1. **Signaling Server**: Central hub for peer discovery and message routing
2. **MessagingPeer**: Client-side class that handles connection and message exchange
3. **Encryption System**: Uses ml-kem-aes for secure communication

### Message Flow

1. **Connection**: Peer connects to signaling server and registers with public key
2. **Discovery**: Peer discovers other available peers
3. **Public Key Exchange**: Peer requests public keys of other peers
4. **Message Exchange**:
    - Sender encrypts message with recipient's public key
    - Message is sent through signaling server
    - Recipient decrypts message using their private key
    - Decrypted message is passed to registered handlers
5. **Multi-Round Conversations**:
    - Server can ask questions to peers
    - Peers can respond to server questions
    - Conversations can continue for multiple rounds

## Usage

### Basic Setup

```typescript
import { MessagingPeer } from "./path/to/instant_messaging"

// Create a peer instance
const peer = new MessagingPeer({
    serverUrl: "ws://your-signaling-server:3000",
    clientId: "your-unique-id",
    publicKey: yourPublicKey, // Your ml-kem public key
})

// Connect to the server
await peer.connect()
```

### Message Handling

To handle incoming messages, register a handler using `onMessage`:

```typescript
// Register a handler for incoming messages
peer.onMessage((message, fromId) => {
    // Handle the decrypted message here
    console.log(`Message from ${fromId}:`, message)

    // If you're building a UI, you might update the DOM:
    const messageElement = document.createElement("div")
    messageElement.textContent = `${fromId}: ${message}`
    document.getElementById("messages-container").appendChild(messageElement)
})
```

### Sending Messages

```typescript
// Send a message to a specific peer
await peer.sendMessage("target-peer-id", "Hello from me!")
```

### Peer Discovery

```typescript
// Discover all connected peers
const peers = await peer.discoverPeers()
console.log("Available peers:", peers)
```

### Multi-Round Conversations with Server

MessagingPeer supports multi-round conversations with the server:

```typescript
// Register a handler for server questions
peer.onServerQuestion((question, questionId) => {
    console.log("Server asked:", question)

    // Process the question and prepare a response
    const response = { answer: "This is my answer" }

    // Send the response back to the server
    peer.respondToServer(questionId, response)
})
```

### Request-Response Pattern

The class provides a robust request-response pattern through the `sendToServerAndWait` method:

```typescript
// Basic usage
const response = await peer.sendToServerAndWait(
    {
        type: "custom_action",
        payload: { someData: "value" },
    },
    "custom_action_success",
)

// With retry logic
const response = await peer.sendToServerAndWait(
    {
        type: "custom_action",
        payload: { someData: "value" },
    },
    "custom_action_success",
    {
        retryCount: 3,
        timeout: 5000,
    },
)

// With custom error handling
const response = await peer.sendToServerAndWait(
    {
        type: "custom_action",
        payload: { someData: "value" },
    },
    "custom_action_success",
    {
        errorHandler: error => {
            console.error("Custom error handling:", error)
        },
    },
)

// With filtering
const response = await peer.sendToServerAndWait(
    {
        type: "custom_action",
        payload: { someData: "value" },
    },
    "custom_action_success",
    {
        filterFn: message => message.payload.someProperty === expectedValue,
    },
)
```

### Complete Example: Building a Messenger App

```typescript
// In your application file (e.g., myMessenger.ts)
import { MessagingPeer } from "./path/to/instant_messaging"

// Create a peer instance
const peer = new MessagingPeer({
    serverUrl: "ws://your-signaling-server:3000",
    clientId: "your-unique-id",
    publicKey: yourPublicKey, // Your ml-kem public key
})

// Connect to the server
await peer.connect()

// Register a handler for incoming messages
peer.onMessage((message, fromId) => {
    // Print the message to the console
    console.log(`Message from ${fromId}:`, message)

    // If you're building a UI, you might update the DOM:
    const messageElement = document.createElement("div")
    messageElement.textContent = `${fromId}: ${message}`
    document.getElementById("messages-container").appendChild(messageElement)
})

// Register a handler for server questions
peer.onServerQuestion((question, questionId) => {
    console.log("Server asked:", question)

    // Process the question and prepare a response
    const response = { answer: "This is my answer" }

    // Send the response back to the server
    peer.respondToServer(questionId, response)
})

// Discover other peers
const peers = await peer.discoverPeers()
console.log("Available peers:", peers)

// Send a message to a specific peer
await peer.sendMessage("target-peer-id", "Hello from me!")
```

## Message Types

The system supports various message types:

-   **"message"**: Encrypted peer-to-peer messages

    ```typescript
    // Example of a received message payload
    {
      type: "message",
      payload: {
        message: {
          algorithm: "ml-kem-aes",
          encryptedData: Uint8Array,
          cipherText: Uint8Array
        },
        fromId: "sender-peer-id"
      }
    }

    // After decryption, handlers receive:
    // message = "Hello, this is the decrypted message"
    // fromId = "sender-peer-id"
    ```

-   **"register"**: Register a new peer
-   **"discover"**: Get list of all connected peers
-   **"peer_disconnected"**: Notification when a peer disconnects
-   **"request_public_key"**: Request a peer's public key
-   **"public_key_response"**: Response containing a peer's public key
-   **"server_question"**: Question from the server to a peer
-   **"peer_response"**: Response from a peer to a server question
-   **"debug_question"**: Debug message to trigger a server question
-   **"error"**: Error notification with details

## Event Handlers

MessagingPeer provides several handler registration methods:

-   **onMessage**: Handle incoming messages
-   **onError**: Handle errors
-   **onPeerDisconnected**: Handle peer disconnection events
-   **onConnectionStateChange**: Handle connection state changes
-   **onServerQuestion**: Handle questions from the server

## Reconnection Logic

MessagingPeer includes automatic reconnection with exponential backoff:

-   Starts with a base delay of 1 second
-   Doubles the delay with each attempt (1s, 2s, 4s, 8s, etc.)
-   Caps the maximum delay at 30 seconds
-   Limits the number of reconnection attempts to 10

## Request-Response Methods

MessagingPeer provides several methods for request-response patterns:

-   **sendToServerAndWait**: Send a message and wait for a specific response type

    -   Supports custom error handling
    -   Supports retry logic
    -   Supports filtering by additional criteria
    -   Supports timeout configuration

-   **registerAndWait**: Register with the server and wait for confirmation
-   **discoverPeers**: Discover all connected peers
-   **requestPublicKey**: Request a peer's public key
-   **respondToServer**: Respond to a server question

## TODO: Future Documentation

-   [ ] Detailed explanation of the encryption/decryption process
-   [ ] Security considerations and best practices
-   [ ] Performance optimization tips
-   [ ] Troubleshooting guide
-   [ ] API reference with all methods and parameters
-   [ ] Examples for different use cases (chat app, file transfer, etc.)
-   [ ] Integration with different UI frameworks (React, Vue, etc.)
-   [ ] Testing strategies
-   [ ] Deployment guide for the signaling server
-   [ ] Scaling considerations for the signaling server
