import { wordList } from './wordlist';
import { createHash } from 'crypto';

/**
 * Custom mnemonic implementation for Falcon keys.
 * This implementation is designed to work with Falcon's key sizes and doesn't rely on BIP39.
 */

/**
 * Convert a Uint8Array to a mnemonic phrase
 * @param data The Uint8Array to convert
 * @returns A mnemonic phrase (12 words)
 */
export function uint8ArrayToMnemonic(data: Uint8Array): string {
    // We'll use 12 words, each representing 11 bits of entropy
    // This gives us 132 bits of entropy, which is sufficient for Falcon keys
    
    // Convert the Uint8Array to a binary string
    let binary = '';
    for (let i = 0; i < data.length; i++) {
        binary += data[i].toString(2).padStart(8, '0');
    }
    
    // Ensure we have enough bits
    while (binary.length < 132) {
        binary += '0';
    }
    
    // Take the first 132 bits
    binary = binary.substring(0, 132);
    
    // Split into 11-bit chunks
    const chunks: string[] = [];
    for (let i = 0; i < 12; i++) {
        chunks.push(binary.substring(i * 11, (i + 1) * 11));
    }
    
    // Convert each chunk to a decimal number and use it to select a word
    const words: string[] = [];
    for (const chunk of chunks) {
        const index = parseInt(chunk, 2);
        words.push(wordList[index % wordList.length]);
    }
    
    return words.join(' ');
}

/**
 * Convert a mnemonic phrase to a Uint8Array
 * @param mnemonic The mnemonic phrase
 * @returns A Uint8Array of 48 bytes (384 bits) suitable for Falcon key generation
 */
export function mnemonicToUint8Array(mnemonic: string): Uint8Array {
    // Split the mnemonic into words
    const words = mnemonic.trim().split(/\s+/);
    
    if (words.length !== 12) {
        throw new Error('Invalid mnemonic phrase: must contain exactly 12 words');
    }
    
    // Convert each word to its index in the word list
    const indices: number[] = [];
    for (const word of words) {
        const index = wordList.indexOf(word);
        if (index === -1) {
            throw new Error(`Invalid word in mnemonic: ${word}`);
        }
        indices.push(index);
    }
    
    // Convert indices to binary
    let binary = '';
    for (const index of indices) {
        binary += index.toString(2).padStart(11, '0');
    }
    
    // Convert binary to initial entropy bytes
    const entropyBytes: number[] = [];
    for (let i = 0; i < binary.length; i += 8) {
        const byte = binary.substring(i, i + 8);
        entropyBytes.push(parseInt(byte, 2));
    }
    
    // Create initial entropy Uint8Array
    const entropy = new Uint8Array(entropyBytes);
    
    // Use SHA-512 to expand the entropy to 48 bytes
    const hash = createHash('sha512');
    hash.update(entropy);
    const expandedEntropy = new Uint8Array(hash.digest().buffer.slice(0, 48));
    
    return expandedEntropy;
}

/**
 * Validate a mnemonic phrase
 * @param mnemonic The mnemonic phrase to validate
 * @returns True if the mnemonic is valid, false otherwise
 */
export function validateMnemonic(mnemonic: string): boolean {
    try {
        mnemonicToUint8Array(mnemonic);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Generate a random mnemonic phrase
 * @returns A random mnemonic phrase
 */
export function generateMnemonic(): string {
    // Generate a random Uint8Array
    const randomBytes = new Uint8Array(16); // 128 bits
    crypto.getRandomValues(randomBytes);
    
    // Convert to mnemonic
    return uint8ArrayToMnemonic(randomBytes);
} 