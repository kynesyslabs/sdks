import DefaultChainAsync from "./types/defaultChainAsync";

export default class DEMOS extends DefaultChainAsync {

    provider = null
    wallet = null
    rpc_url = null
    connected = false

    constructor(rpc_url = null) {
        super(rpc_url)
        this.provider = null
        this.wallet = null
        if (rpc_url) {
            this.setRPC(rpc_url)
        }
    }

    // SECTION Unimplemented methods

    connect(rpc_url: string): Promise<any> {
        throw new Error("Method not implemented.");
    }

    async setRPC(rpc_url: string) {
        throw new Error("Method not implemented.");
    }

    getBalance(address: string): Promise<string> {
        throw new Error("Method not implemented.");
    }
    prepareTransfer(receiver: string, amount: string): Promise<any> {
        throw new Error("Method not implemented.");
    }
    preparePay(receiver: string, amount: string): Promise<any> {
        throw new Error("Method not implemented.");
    }
    getEmptyTransaction() {
        throw new Error("Method not implemented.");
    }
    getAddress(): string {
        throw new Error("Method not implemented.");
    }
    connectWallet(privateKey: string) {
        throw new Error("Method not implemented.");
    }
    signTransaction(raw_transaction: any): Promise<any> {
        throw new Error("Method not implemented.");
    }

}