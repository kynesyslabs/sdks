import bigInt from "big-integer"
import generateLargePrime from "@/encryption/zK/primer"
import {
    hideSecretFields,
    INSPECT_CUSTOM,
    redactedInspect,
} from "@/encryption/secretFields"

export class Prover {
    private secret: bigInt.BigInteger
    public modulus: any
    private randomValue: any

    constructor(prime1: any, prime2: any, secret: bigInt.BigInteger) {
        // randomValue is the per-round nonce; with the response it reveals the secret.
        hideSecretFields(this, ["secret", "randomValue"])
        this.modulus = prime1.multiply(prime2)
        this.secret = secret
    }

    /** Serialises without the secret or the round nonce. */
    toJSON() {
        return { modulus: this.modulus?.toString() ?? null }
    }

    [INSPECT_CUSTOM]() {
        return redactedInspect("Prover", this.toJSON())
    }

    generateCommitment(): any {
        this.randomValue = bigInt.randBetween(2, this.modulus.subtract(2))
        return this.randomValue.modPow(2, this.modulus)
    }

    respondToChallenge(challenge: number): any {
        return challenge === 0
            ? this.randomValue
            : this.randomValue.multiply(this.secret).mod(this.modulus)
    }
}

export class Verifier {
    private modulus: any
    private commitment: any

    constructor(modulus: any) {
        this.modulus = modulus
    }

    generateChallenge(commitment: any): number {
        // CSPRNG: a predictable challenge breaks the soundness of the
        // interactive ZK proof.
        this.commitment = commitment
        const buf = new Uint8Array(1)
        crypto.getRandomValues(buf)
        return buf[0] & 1
    }

    verifyResponse(response: any, challenge: number): boolean {
        const responseSquared = response.modPow(2, this.modulus)
        if (challenge === 0) {
            return responseSquared.equals(this.commitment)
        } else {
            return !responseSquared.equals(this.commitment)
        }
    }
}
