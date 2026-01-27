/**
 * KeyServerClient Tests
 *
 * Tests for the Key Server OAuth client.
 * Note: These tests use mocked fetch to avoid requiring a running Key Server.
 */

import { KeyServerClient, OAuthError } from "@/keyserver";
import type {
    OAuthInitResult,
    OAuthPollResult,
    OAuthUserInfo,
    DAHRAttestation,
} from "@/keyserver";

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe("KeyServerClient", () => {
    const testConfig = {
        endpoint: "http://localhost:3030",
        nodePubKey: "abc123def456",
    };

    let client: KeyServerClient;

    beforeEach(() => {
        client = new KeyServerClient(testConfig);
        mockFetch.mockReset();
    });

    describe("constructor", () => {
        test("normalizes endpoint by removing trailing slash", () => {
            const clientWithSlash = new KeyServerClient({
                endpoint: "http://localhost:3030/",
                nodePubKey: "test",
            });
            // Verify via a call that the endpoint is normalized
            mockFetch.mockResolvedValueOnce({
                json: async () => ({ success: true, providers: ["github"] }),
            });

            clientWithSlash.getProviders();

            expect(mockFetch).toHaveBeenCalledWith(
                "http://localhost:3030/oauth/providers",
                expect.any(Object),
            );
        });
    });

    describe("getProviders", () => {
        test("returns list of available providers", async () => {
            mockFetch.mockResolvedValueOnce({
                json: async () => ({
                    success: true,
                    providers: ["github", "discord"],
                }),
            });

            const providers = await client.getProviders();

            expect(providers).toEqual(["github", "discord"]);
            expect(mockFetch).toHaveBeenCalledWith(
                "http://localhost:3030/oauth/providers",
                {
                    method: "GET",
                    headers: { "Content-Type": "application/json" },
                },
            );
        });

        test("throws OAuthError when providers not available", async () => {
            mockFetch.mockResolvedValueOnce({
                json: async () => ({
                    success: false,
                    error: { code: "OAUTH_NOT_AVAILABLE", message: "OAuth not configured" },
                }),
            });

            try {
                await client.getProviders();
                fail("Expected OAuthError to be thrown");
            } catch (error) {
                expect(error).toBeInstanceOf(OAuthError);
                expect((error as OAuthError).code).toBe("OAUTH_NOT_AVAILABLE");
            }
        });
    });

    describe("initiateOAuth", () => {
        test("initiates OAuth flow and returns auth URL", async () => {
            const mockResponse: OAuthInitResult & { success: boolean } = {
                success: true,
                authUrl: "https://github.com/login/oauth/authorize?...",
                state: "state123",
                expiresAt: Date.now() + 600000,
            };

            mockFetch.mockResolvedValueOnce({
                json: async () => mockResponse,
            });

            const result = await client.initiateOAuth("github");

            expect(result.success).toBe(true);
            expect(result.authUrl).toContain("github.com");
            expect(result.state).toBe("state123");
            expect(mockFetch).toHaveBeenCalledWith(
                "http://localhost:3030/oauth/init",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        service: "github",
                        nodePubKey: testConfig.nodePubKey,
                        scopes: undefined,
                    }),
                },
            );
        });

        test("passes custom scopes when provided", async () => {
            mockFetch.mockResolvedValueOnce({
                json: async () => ({
                    success: true,
                    authUrl: "https://github.com/...",
                    state: "state123",
                    expiresAt: Date.now() + 600000,
                }),
            });

            await client.initiateOAuth("github", { scopes: ["user:email", "read:user"] });

            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: expect.stringContaining('"scopes":["user:email","read:user"]'),
                }),
            );
        });

        test("throws OAuthError on invalid service", async () => {
            mockFetch.mockResolvedValueOnce({
                json: async () => ({
                    success: false,
                    error: { code: "OAUTH_INVALID_SERVICE", message: "Invalid service" },
                }),
            });

            await expect(client.initiateOAuth("github")).rejects.toThrow(OAuthError);
        });
    });

    describe("pollOAuth", () => {
        test("returns pending status while waiting", async () => {
            const mockResponse: OAuthPollResult = {
                success: true,
                status: "pending",
            };

            mockFetch.mockResolvedValueOnce({
                json: async () => mockResponse,
            });

            const result = await client.pollOAuth("state123");

            expect(result.status).toBe("pending");
            expect(mockFetch).toHaveBeenCalledWith(
                "http://localhost:3030/oauth/poll",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        state: "state123",
                        nodePubKey: testConfig.nodePubKey,
                    }),
                },
            );
        });

        test("returns completed status with user info and attestation", async () => {
            const mockUser: OAuthUserInfo = {
                service: "github",
                providerId: "12345",
                username: "testuser",
                email: "test@example.com",
                avatarUrl: "https://avatars.githubusercontent.com/...",
                verifiedAt: Date.now(),
            };

            const mockAttestation: DAHRAttestation = {
                requestHash: "abc123",
                responseHash: "def456",
                signature: {
                    type: "Ed25519",
                    data: "sig789",
                },
                metadata: {
                    sessionId: "session123",
                    timestamp: Date.now(),
                    keyServerPubKey: "kspub",
                    nodePubKey: testConfig.nodePubKey,
                    version: "1.0.0",
                },
            };

            const mockResponse: OAuthPollResult = {
                success: true,
                status: "completed",
                result: mockUser,
                attestation: mockAttestation,
            };

            mockFetch.mockResolvedValueOnce({
                json: async () => mockResponse,
            });

            const result = await client.pollOAuth("state123");

            expect(result.status).toBe("completed");
            expect(result.result).toEqual(mockUser);
            expect(result.attestation).toEqual(mockAttestation);
        });

        test("returns failed status with error", async () => {
            const mockResponse: OAuthPollResult = {
                success: true,
                status: "failed",
                error: { code: "OAUTH_DENIED", message: "User denied access" },
            };

            mockFetch.mockResolvedValueOnce({
                json: async () => mockResponse,
            });

            const result = await client.pollOAuth("state123");

            expect(result.status).toBe("failed");
            expect(result.error?.code).toBe("OAUTH_DENIED");
        });
    });

    describe("verifyOAuth", () => {
        test("completes full OAuth flow successfully", async () => {
            const mockUser: OAuthUserInfo = {
                service: "github",
                providerId: "12345",
                username: "testuser",
                verifiedAt: Date.now(),
            };

            const mockAttestation: DAHRAttestation = {
                requestHash: "abc123",
                responseHash: "def456",
                signature: { type: "Ed25519", data: "sig789" },
                metadata: {
                    sessionId: "session123",
                    timestamp: Date.now(),
                    keyServerPubKey: "kspub",
                    nodePubKey: testConfig.nodePubKey,
                    version: "1.0.0",
                },
            };

            // First call: initiateOAuth
            mockFetch.mockResolvedValueOnce({
                json: async () => ({
                    success: true,
                    authUrl: "https://github.com/...",
                    state: "state123",
                    expiresAt: Date.now() + 600000,
                }),
            });

            // Second call: pollOAuth (completed)
            mockFetch.mockResolvedValueOnce({
                json: async () => ({
                    success: true,
                    status: "completed",
                    result: mockUser,
                    attestation: mockAttestation,
                }),
            });

            let authUrlReceived = "";
            let stateReceived = "";
            const onAuthUrl = (url: string, state: string) => {
                authUrlReceived = url;
                stateReceived = state;
            };

            const result = await client.verifyOAuth("github", {
                onAuthUrl,
                pollInterval: 10, // Fast polling for test
            });

            expect(result.success).toBe(true);
            expect(result.user.username).toBe("testuser");
            expect(result.attestation).toEqual(mockAttestation);
            expect(authUrlReceived).toContain("github.com");
            expect(stateReceived).toBe("state123");
        });

        test("polls multiple times until completed", async () => {
            const mockUser: OAuthUserInfo = {
                service: "discord",
                providerId: "67890",
                username: "discorduser",
                verifiedAt: Date.now(),
            };

            const mockAttestation: DAHRAttestation = {
                requestHash: "abc",
                responseHash: "def",
                signature: { type: "Ed25519", data: "sig" },
                metadata: {
                    sessionId: "sess",
                    timestamp: Date.now(),
                    keyServerPubKey: "ks",
                    nodePubKey: testConfig.nodePubKey,
                    version: "1.0.0",
                },
            };

            // First call: initiateOAuth
            mockFetch.mockResolvedValueOnce({
                json: async () => ({
                    success: true,
                    authUrl: "https://discord.com/...",
                    state: "state456",
                    expiresAt: Date.now() + 600000,
                }),
            });

            // Second call: pending
            mockFetch.mockResolvedValueOnce({
                json: async () => ({ success: true, status: "pending" }),
            });

            // Third call: pending
            mockFetch.mockResolvedValueOnce({
                json: async () => ({ success: true, status: "pending" }),
            });

            // Fourth call: completed
            mockFetch.mockResolvedValueOnce({
                json: async () => ({
                    success: true,
                    status: "completed",
                    result: mockUser,
                    attestation: mockAttestation,
                }),
            });

            let pollCount = 0;
            const onPoll = () => { pollCount++; };

            const result = await client.verifyOAuth("discord", {
                onPoll,
                pollInterval: 10,
            });

            expect(result.success).toBe(true);
            expect(result.user.username).toBe("discorduser");
            expect(pollCount).toBe(3); // 3 poll attempts
        });

        test("throws on OAuth flow failure", async () => {
            // First call: initiateOAuth
            mockFetch.mockResolvedValueOnce({
                json: async () => ({
                    success: true,
                    authUrl: "https://github.com/...",
                    state: "state789",
                    expiresAt: Date.now() + 600000,
                }),
            });

            // Second call: failed
            mockFetch.mockResolvedValueOnce({
                json: async () => ({
                    success: true,
                    status: "failed",
                    error: { code: "OAUTH_DENIED", message: "User denied" },
                }),
            });

            await expect(
                client.verifyOAuth("github", { pollInterval: 10 }),
            ).rejects.toThrow(OAuthError);
        });

        test("throws on OAuth flow expired", async () => {
            // First call: initiateOAuth
            mockFetch.mockResolvedValueOnce({
                json: async () => ({
                    success: true,
                    authUrl: "https://github.com/...",
                    state: "stateExpired",
                    expiresAt: Date.now() + 600000,
                }),
            });

            // Second call: expired
            mockFetch.mockResolvedValueOnce({
                json: async () => ({
                    success: true,
                    status: "expired",
                }),
            });

            await expect(
                client.verifyOAuth("github", { pollInterval: 10 }),
            ).rejects.toMatchObject({
                code: "OAUTH_EXPIRED",
            });
        });

        test("throws on timeout", async () => {
            // First call: initiateOAuth
            mockFetch.mockResolvedValueOnce({
                json: async () => ({
                    success: true,
                    authUrl: "https://github.com/...",
                    state: "stateTimeout",
                    expiresAt: Date.now() + 600000,
                }),
            });

            // Always return pending
            mockFetch.mockResolvedValue({
                json: async () => ({ success: true, status: "pending" }),
            });

            await expect(
                client.verifyOAuth("github", {
                    timeout: 50, // Very short timeout
                    pollInterval: 20,
                }),
            ).rejects.toMatchObject({
                code: "OAUTH_TIMEOUT",
            });
        }, 10000);
    });

    describe("error handling", () => {
        test("throws NETWORK_ERROR on fetch failure", async () => {
            mockFetch.mockRejectedValueOnce(new Error("Network error"));

            await expect(client.getProviders()).rejects.toMatchObject({
                code: "NETWORK_ERROR",
            });
        });

        test("OAuthError.fromResponse creates error from response", () => {
            const error = OAuthError.fromResponse({
                code: "OAUTH_DENIED",
                message: "User denied access",
            });

            expect(error).toBeInstanceOf(OAuthError);
            expect(error.code).toBe("OAUTH_DENIED");
            expect(error.message).toBe("User denied access");
        });
    });
});
