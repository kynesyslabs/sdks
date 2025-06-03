// Common types and constants
export * as types from "./types"
// Basic cryptographic and data manipulation functions
export * as encryption from "./encryption"
export * as utils from "./utils"

//  Specific features of the SDK
export * as xmlocalsdk from "./multichain/localsdk"
export * as xmwebsdk from "./multichain/websdk"
export * as xmcore from "./multichain/core" // Exporting the core module too

export * as wallet from "./wallet"
export * as demoswork from "./demoswork"

export * as l2ps from "./l2ps" // REVIEW This is exporting the type of the L2PS, but the l2psCalls is in the websdk

export * as websdk from "./websdk"
export * as abstraction from "./abstraction"
export * as web2 from "./websdk/Web2Calls"

// Export bridge module and its types
export * as bridge from "./bridge"

export * as instantMessaging from "./instant_messaging"
