// Export Falcon class
export { default as Falcon } from './falcon';
export type { FalconKeypair } from './falcon';
// Export mnemonic functions
export {
  uint8ArrayToMnemonic,
  mnemonicToUint8Array,
  validateMnemonic,
  generateMnemonic
} from './mnemonic';

// Export word list
export { wordList } from './wordlist';