export function serializeUint8Array(u8: Uint8Array): string {
    // Convert to binary string
    const binary = String.fromCharCode(...u8)
    // Convert binary string to Base64
    return btoa(binary)
}

export function deserializeUint8Array(base64: string): Uint8Array {
    // Decode Base64 to binary string
    const binary = atob(base64)
    // Convert binary string to Uint8Array
    const len = binary.length
    const u8 = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
        u8[i] = binary.charCodeAt(i)
    }
    return u8
}