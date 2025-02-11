import { Buffer } from "buffer/"

function forgeToString(forgeBuffer: any, isHex = true) {
    if (isHex) return ForgeToHex(forgeBuffer)
    else return forgeToRawString(forgeBuffer)
}

// NOTE Only if the string is an hex string it can be reverted to a forge buffer
function stringToForge(string: any, isHex = true) {
    if (isHex) return HexToForge(string) // Uint8Array
    else return rawStringToForge(string) // Will try to hexify and then HexToForge
}

// NOTE It does output just a stringified version of the buffer
function forgeToRawString(forgeBuffer: any) {
    // REVIEW Buffer or Uint8Array or BinaryBuffer
    // This should be a Uint8Array-like object or a Buffer or a BinaryBuffer
    const derived = JSON.stringify(forgeBuffer) // FIXME Error handling!
    return derived // String
}

// NOTE Remove if vestigial
function rawStringToForge(forgeString: any[]) {
    // NOTE This works only if the string can be reduced to a proper hex private key
    let hexified = Buffer.from(forgeString).toString("hex")
    if (hexified.length != 128) {
        return false
    }
    const derived = HexToForge(hexified)
    return derived
}

// NOTE The following methods must be revertible with each other:
// - ForgeToHex
// - HexToForge

// INFO forgeBuffer comes in as the raw result of forge methods (so is most likely a BinaryBuffer)
function ForgeToHex(forgeBuffer: any) {
    // BinaryBuffer
    // Transforming into a supported Buffer and then to hex string for portability
    const rebuffer = Buffer.from(forgeBuffer)
    forgeBuffer = rebuffer.toString("hex")
    return "0x" + forgeBuffer // String
}

// INFO finalArray must come out as an acceptable input for forge methods
function HexToForge(forgeString: string) {
    // String
    forgeString = forgeString.slice(2)
    // Preparing the Uint8Array to be used to revert the hex string
    const finalArray = new Uint8Array(64)
    // Parsing the hex string into a Uint8Array by splitting it into 2-char chunks and parsing them into decimal values
    for (let i = 0; i < forgeString.length; i += 2) {
        const hexValue = forgeString.substr(i, 2)
        const decimalValue = parseInt(hexValue, 16)
        finalArray[i / 2] = decimalValue
    }
    return finalArray // Uint8Array
}

export { forgeToString, stringToForge }
