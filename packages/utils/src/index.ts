export async function sleep(time: number) {
    return new Promise(resolve => setTimeout(resolve, time))
}

/**
 * Validates that an address contains a 0x prefix followed by 64 hex characters.
 * 
 * @param address - The address to validate.
 * @returns True if the address is valid, false otherwise.
 */
export function validateEd25519Address(address: string) {
    return /^0x[0-9a-f]{64}$/i.test(address)
}

export * as dataManipulation from "./dataManipulation"
export { deserializeUint8Array, serializeUint8Array } from "./uint8Serialize"
export { _required as required } from "./required"
export { ForgeToHex, HexToForge, HexToObject, ObjectToHex, copyCreate } from "./dataManipulation"
export { hexToUint8Array, uint8ArrayToHex } from "./bufferTools"