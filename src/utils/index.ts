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

export function assertValidNonce(nonce: number): number {
    if (typeof nonce !== "number" || !Number.isInteger(nonce) || nonce < 0) {
        throw new Error(
            `Invalid nonce: expected a non-negative integer, got ${nonce}`,
        )
    }
    return nonce
}

export async function resolveNonce(
    customNonce: number | undefined,
    fetchCurrent: () => Promise<number>,
    reserve?: () => Promise<number>,
): Promise<number> {
    if (customNonce !== undefined) {
        return assertValidNonce(customNonce)
    }
    // When a reserver is supplied (auto-nonce enabled on the client) it
    // sequences concurrent sends locally, seeded from the mempool-aware
    // pending nonce. Absent it, keep the historical confirmed-nonce read.
    if (reserve) {
        return reserve()
    }
    return (await fetchCurrent()) + 1
}

export * as dataManipulation from "./dataManipulation"
export { deserializeUint8Array, serializeUint8Array } from "./uint8Serialize"
export { demToOs, osToDem, parseOsString, formatDem, toOsString } from "@/denomination/conversion"