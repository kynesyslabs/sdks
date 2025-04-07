import crypto from 'crypto'

/**
 * Hashes any string using crypto subtle
 */
export async function sha256 (string: string): Promise<string> {
  const utf8 = new TextEncoder().encode(string)
  const hashBuffer = await crypto.subtle.digest('SHA-256', utf8)
  const hashArray = Array.from(new Uint8Array(hashBuffer)) // FIXME Review if it's to change to buffer here
  // sourcery skip: inline-immediately-returned-variable
  const hashHex = hashArray
    .map((bytes) => bytes.toString(16).padStart(2, '0'))
    .join('')
  return hashHex
}
