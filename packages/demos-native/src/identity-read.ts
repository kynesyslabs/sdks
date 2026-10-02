import type { Demos } from "./client.js";
import type { DemosAccount, RpcResponse } from "./types.js";

// REVIEW: Keep identity reads narrowly scoped to the authenticated GCR APIs
// used by DACS; adding identity mutation belongs in a separately reviewed API.
/** Authenticated, read-only access to Demos identity records. */
export class Identities {
  /**
   * Read the identity graph for an address.
   *
   * A connected wallet is required when `address` is omitted and is used to
   * authenticate the RPC whenever present. Transport failures are returned in
   * the compatibility `RpcResponse`; callers must require `result === 200`.
   */
  async getIdentities(
    demos: Demos,
    call = "getIdentities",
    address?: string,
  ): Promise<RpcResponse> {
    let resolvedAddress = address;
    if (!resolvedAddress) {
      if (!demos.walletConnected) {
        throw new Error(
          "getIdentities: no address given and no wallet connected. Pass an address or connect a wallet.",
        );
      }
      resolvedAddress = demos.getAddress();
    }
    return await demos.rpcCall(
      {
        method: "gcr_routine",
        params: [{ method: call, params: [resolvedAddress] }],
      },
      demos.walletConnected,
    );
  }

  /**
   * Resolve an identity claim to its Demos accounts.
   *
   * Requires a connected wallet because the reverse GCR lookup is
   * authenticated. Throws on an RPC failure or malformed account collection.
   */
  async getDemosIdsByIdentity(
    demos: Demos,
    identity: Record<string, unknown>,
  ): Promise<DemosAccount[]> {
    const response = await demos.rpcCall(
      {
        method: "gcr_routine",
        params: [{ method: "getAccountByIdentity", params: [identity] }],
      },
      true,
    );
    if (response.result !== 200) {
      throw new Error(
        `Demos identity lookup failed with RPC result ${response.result}`,
        { cause: response.response },
      );
    }
    if (!Array.isArray(response.response)) {
      throw new TypeError("Demos identity lookup returned no valid account list");
    }
    return response.response as DemosAccount[];
  }

  /**
   * Resolve a supported Web2 claim to Demos accounts.
   *
   * Requires a connected wallet, sends an authenticated read, and propagates
   * transport, RPC and response-shape failures.
   */
  async getDemosIdsByWeb2Identity(
    demos: Demos,
    context: "twitter" | "github" | "discord" | "telegram",
    username: string,
    userId?: string,
  ): Promise<DemosAccount[]> {
    return await this.getDemosIdsByIdentity(demos, {
      type: "web2",
      context,
      username,
      userId,
    });
  }

  /**
   * Resolve a namespaced Web3 address claim to Demos accounts.
   *
   * Requires a connected wallet, sends an authenticated read, and propagates
   * transport, RPC and response-shape failures.
   */
  async getDemosIdsByWeb3Identity(
    demos: Demos,
    chain: `${string}.${string}`,
    address: string,
  ): Promise<DemosAccount[]> {
    return await this.getDemosIdsByIdentity(demos, {
      type: "xm",
      chain,
      address,
    });
  }
}
