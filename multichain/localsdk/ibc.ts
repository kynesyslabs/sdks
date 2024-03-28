// import { required } from '../_utils'
import { IDefaultChainLocal } from "@demos/mx-core";
import { IBC as IBCCore, required } from "@demos/mx-core";

// @ts-ignore
export default class IBC extends IBCCore implements IDefaultChainLocal {
  constructor(rpc_url: string) {
    super(rpc_url);
  }

  async sendTransaction(signed_tx: Uint8Array) {
    required(this.wallet, "Wallet not connected");

    const hash = await this.wallet.broadcastTxSync(signed_tx);
    return {
      hash,
      result: "success",
    };
  }

  async getInfo(): Promise<string> {
    throw new Error("Method not implemented.");
  }
}
