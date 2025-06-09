export type PQCAlgorithm = "falcon" | "ml-dsa"
export type SigningAlgorithm = "ed25519" | PQCAlgorithm
export type EncryptionAlgorithm = "ml-kem-aes" | "rsa"