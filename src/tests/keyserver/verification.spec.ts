/**
 * Attestation Verification Tests
 *
 * Tests for the DAHR attestation verification utilities.
 */

import {
    verifyAttestation,
    verifyOAuthAttestation,
} from "@/keyserver/verification";
import type {
    DAHRAttestation,
    OAuthVerificationResult,
    OAuthUserInfo,
} from "@/keyserver";
import { Cryptography } from "@/encryption";
import * as crypto from "crypto";

describe("Attestation Verification", () => {
    // Generate a test keypair for signing using a random seed
    const seed = crypto.randomBytes(32);
    const testKeypair = Cryptography.newFromSeed(seed);
    const keyServerPubKey = Buffer.from(testKeypair.publicKey).toString("hex");
    const keyServerPrivKey = testKeypair.privateKey;

    function createValidAttestation(responseHash: string): DAHRAttestation {
        const signature = Cryptography.ed25519.sign(responseHash, keyServerPrivKey);

        return {
            requestHash: "abc123",
            responseHash,
            signature: {
                type: "Ed25519",
                data: Buffer.from(signature).toString("hex"),
            },
            metadata: {
                sessionId: "session123",
                timestamp: Date.now(),
                keyServerPubKey,
                nodePubKey: "node456",
                version: "1.0.0",
            },
        };
    }

    describe("verifyAttestation", () => {
        test("returns valid for correctly signed attestation", () => {
            const attestation = createValidAttestation("validResponseHash");

            const result = verifyAttestation(attestation, keyServerPubKey);

            expect(result.valid).toBe(true);
            expect(result.metadata).toBeDefined();
            expect(result.metadata?.sessionId).toBe("session123");
        });

        test("returns invalid for mismatched key server public key", () => {
            const attestation = createValidAttestation("testHash");

            const result = verifyAttestation(attestation, "wrongPubKey");

            expect(result.valid).toBe(false);
            expect(result.reason).toBe("Key Server public key mismatch");
        });

        test("returns invalid for tampered signature", () => {
            const attestation = createValidAttestation("originalHash");
            // Tamper with the signature
            attestation.signature.data = "0".repeat(128);

            const result = verifyAttestation(attestation, keyServerPubKey);

            expect(result.valid).toBe(false);
            expect(result.reason).toContain("Signature verification");
        });

        test("returns invalid for tampered responseHash", () => {
            const attestation = createValidAttestation("originalHash");
            // Tamper with the response hash after signing
            attestation.responseHash = "tamperedHash";

            const result = verifyAttestation(attestation, keyServerPubKey);

            expect(result.valid).toBe(false);
            expect(result.reason).toBe("Signature verification failed");
        });

        test("returns invalid for expired attestation", () => {
            const attestation = createValidAttestation("testHash");
            // Set timestamp to 2 hours ago
            attestation.metadata.timestamp = Date.now() - 7200000;

            const result = verifyAttestation(attestation, keyServerPubKey, {
                maxAge: 3600000, // 1 hour
            });

            expect(result.valid).toBe(false);
            expect(result.reason).toContain("expired");
        });

        test("ignores expiration when maxAge is 0", () => {
            const attestation = createValidAttestation("testHash");
            // Set timestamp to 24 hours ago
            attestation.metadata.timestamp = Date.now() - 86400000;

            const result = verifyAttestation(attestation, keyServerPubKey, {
                maxAge: 0,
            });

            expect(result.valid).toBe(true);
        });

        test("returns invalid for wrong node public key when expected", () => {
            const attestation = createValidAttestation("testHash");

            const result = verifyAttestation(attestation, keyServerPubKey, {
                expectedNodePubKey: "differentNodePubKey",
            });

            expect(result.valid).toBe(false);
            expect(result.reason).toBe("Node public key mismatch");
        });

        test("validates node public key when it matches", () => {
            const attestation = createValidAttestation("testHash");

            const result = verifyAttestation(attestation, keyServerPubKey, {
                expectedNodePubKey: "node456",
            });

            expect(result.valid).toBe(true);
        });

        test("returns invalid for unsupported signature type", () => {
            const attestation = createValidAttestation("testHash");
            (attestation.signature as any).type = "RSA";

            const result = verifyAttestation(attestation, keyServerPubKey);

            expect(result.valid).toBe(false);
            expect(result.reason).toContain("Unsupported signature type");
        });

        test("returns invalid for null attestation", () => {
            const result = verifyAttestation(null as any, keyServerPubKey);

            expect(result.valid).toBe(false);
            expect(result.reason).toBe("Invalid attestation structure");
        });

        test("returns invalid for attestation without signature", () => {
            const attestation = createValidAttestation("testHash");
            delete (attestation as any).signature;

            const result = verifyAttestation(attestation, keyServerPubKey);

            expect(result.valid).toBe(false);
            expect(result.reason).toBe("Invalid attestation structure");
        });
    });

    describe("verifyOAuthAttestation", () => {
        test("verifies attestation from full OAuth result", () => {
            const attestation = createValidAttestation("resultHash");
            const mockUser: OAuthUserInfo = {
                service: "github",
                providerId: "12345",
                username: "testuser",
                verifiedAt: Date.now(),
            };

            const oauthResult: OAuthVerificationResult = {
                success: true,
                user: mockUser,
                attestation,
            };

            const result = verifyOAuthAttestation(oauthResult, keyServerPubKey);

            expect(result.valid).toBe(true);
        });

        test("returns invalid when result has no attestation", () => {
            const oauthResult = {
                success: true,
                user: {
                    service: "github" as const,
                    providerId: "12345",
                    username: "testuser",
                    verifiedAt: Date.now(),
                },
            } as OAuthVerificationResult;

            const result = verifyOAuthAttestation(oauthResult, keyServerPubKey);

            expect(result.valid).toBe(false);
            expect(result.reason).toBe("No attestation in result");
        });

        test("passes options through to verifyAttestation", () => {
            const attestation = createValidAttestation("testHash");
            attestation.metadata.timestamp = Date.now() - 7200000; // 2 hours ago

            const oauthResult: OAuthVerificationResult = {
                success: true,
                user: {
                    service: "discord",
                    providerId: "67890",
                    username: "discorduser",
                    verifiedAt: Date.now(),
                },
                attestation,
            };

            // Should fail with default maxAge (1 hour)
            const result1 = verifyOAuthAttestation(oauthResult, keyServerPubKey);
            expect(result1.valid).toBe(false);

            // Should pass with disabled maxAge
            const result2 = verifyOAuthAttestation(oauthResult, keyServerPubKey, {
                maxAge: 0,
            });
            expect(result2.valid).toBe(true);
        });
    });
});
