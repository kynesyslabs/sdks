import { utf8ToBytes } from '@noble/hashes/utils';
/**
 * Converts a Uint8Array to a hex string
 * @param bytes The Uint8Array to convert
 * @returns The hex string representation of the Uint8Array
 */
function bytesToUtf8(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes);
  }

export { utf8ToBytes, bytesToUtf8 }