import type { Demos } from "./client.js";
import type { DemosAccount, RpcResponse } from "./types.js";

export class Identities {
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
    return response.result === 200
      ? response.response as DemosAccount[]
      : response as unknown as DemosAccount[];
  }

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
