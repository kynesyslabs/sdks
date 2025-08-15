
/**
 * Converts a hexadecimal string (with or without '0x' prefix) to a Uint8Array.
 *
 * @param hexString - The hexadecimal string to convert (e.g., "0x0a1b2c" or "0a1b2c").
 * @returns The corresponding Uint8Array.
 * @throws {Error} If the input string (after removing '0x') has an odd length
 * or contains non-hexadecimal characters.
 */
export function hexToUint8Array(hexString: string): Uint8Array {
    // Remove the '0x' prefix if it exists.
    const normalizedHexString = hexString.startsWith("0x")
        ? hexString.slice(2)
        : hexString

    // Handle empty string case after normalization
    if (normalizedHexString.length === 0) {
        return new Uint8Array(0) // Return an empty Uint8Array for an empty hex string
    }

    // Check if the string has an even number of characters.
    if (normalizedHexString.length % 2 !== 0) {
        throw new Error(
            "Invalid hex string: Hex string must have an even number of characters.",
        )
    }

    // Check if the string contains only valid hexadecimal characters.
    if (!/^[0-9a-fA-F]+$/.test(normalizedHexString)) {
        throw new Error(
            "Invalid hex string: Contains non-hexadecimal characters.",
        )
    }

    // Create an array to store the byte values.
    const bytes = new Uint8Array(normalizedHexString.length / 2)

    // Iterate over the string, taking two characters at a time.
    for (let i = 0; i < normalizedHexString.length; i += 2) {
        const byteString = normalizedHexString.substring(i, i + 2)
        const byteValue = parseInt(byteString, 16) // Parse the hex pair into a number.
        bytes[i / 2] = byteValue
    }

    return bytes
}

/**
 * Converts a Uint8Array to a hexadecimal string representation, prefixed with '0x'.
 *
 * @param bytes - The Uint8Array to convert.
 * @returns The hexadecimal string representation (e.g., "0x0a1b2c").
 */
export function uint8ArrayToHex(bytes: Uint8Array): string {
    // Convert each byte to a 2-digit hex string and pad with '0' if needed.
    const hexBytes = Array.from(bytes, byte => {
        return byte.toString(16).padStart(2, "0")
    })
    // Join the hex strings and prefix with '0x'.
    return "0x" + hexBytes.join("")
}
