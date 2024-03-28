import { IPayOptions } from "./interfaces";

interface Options {
  [key: string]: any;
}

// SECTION: Interfaces

/**
 * Core interface for all SDKs
 */
export interface IDefaultChain {
  provider: any;
  wallet: any;
  rpc_url: string;
  connected: boolean;

  connect: (url: string) => Promise<any>;
  connectWallet: (privateKey: string, options?: Options) => any;
  getBalance: (address: string, options?: Options) => Promise<string>;

  // INFO: preparePay and prepareTransfer are the same
  preparePay: (
    receiver: string,
    amount: string,
    options: Options
  ) => Promise<any>;
  prepareTransfer: (
    receiver: string,
    amount: string,
    options: Options
  ) => Promise<any>;
  getEmptyTransaction: () => any;
  getAddress: () => string;
  setRpc: (rpc_url: string) => any;
  signTransaction: (
    raw_transaction: any,
    options?: {
      privateKey?: string;
    }
  ) => Promise<any>;
  signTransactions: (
    raw_transaction: any[],
    options?: {
      privateKey?: string;
    }
  ) => Promise<any>;
}

/**
 * The default Web SDK interface
 */
export interface IDefaultChainWeb extends IDefaultChain {
  // Web sdk specific methods
}

/**
 * The default Local SDK interface
 */
export interface IDefaultChainLocal extends IDefaultChain {
  getInfo: () => Promise<string>;
  sendTransaction: (tx: any) => Promise<any>;
}

// !SECTION

// SECTION: Abstract Classes

export abstract class DefaultChain implements IDefaultChain {
  provider: any = null;
  name: string = "";
  signer: any = null;
  wallet: any = null;
  rpc_url: string = "";
  connected: boolean = false;

  constructor(rpc_url: string) {
    this.setRpc(rpc_url);
  }

  /**
   * Sets the RPC URL only. Use `await instance.connect()` to connect to the rpc provider
   * @param rpc_url
   */
  setRpc(rpc_url: string) {
    this.rpc_url = rpc_url;
  }

  /**
   * Creates a new instance of this sdk
   * @param rpc_url The RPC URL
   * @returns The sdk instance connected to the RPC provider
   */
  static async create(rpc_url: string): Promise<any> {
    throw new Error("Method not implemented.");
  }

  protected resetInstance() {
    this.provider = null;
    this.wallet = null;
    this.signer = null;
    this.connected = false;
  }

  // ANCHOR Base methods

  /**
   * Connects to the RPC provider
   * @returns A boolean indicating if the connection was successful
   */
  abstract connect(): Promise<boolean>;

  /**
   * Disconnects from the RPC provider and the wallet
   * @returns A boolean indicating if the disconnection was successful
   */
  abstract disconnect(): Promise<boolean>;

  /**
   * Connects to a wallet using a private key
   * @param privateKey The private key of the wallet
   * @returns The wallet object
   */
  abstract connectWallet(privateKey: string, options?: {}): Promise<any>;

  /**
   * Gets the balance of a wallet
   * @param address The wallet address
   * @param options Options
   * @returns The balance of the wallet as a string
   */
  abstract getBalance(address: string, options?: {}): Promise<string>;

  // SECTION: These two methods are for compatibility

  /**
   * Creates a signed transaction to transfer default chain currency
   * @param receiver The receiver's address
   * @param amount The amount to transfer
   * @param options Options
   * @returns The signed transaction
   */
  abstract preparePay(
    receiver: string,
    amount: string,
    options: {}
  ): Promise<any>;

  /**
   * Creates a signed transaction to transfer default chain currency
   * @param receiver The receiver's address
   * @param amount The amount to transfer
   * @param options Options
   * @returns The signed transaction
   */
  abstract prepareTransfer(
    receiver: string,
    amount: string,
    options: {}
  ): Promise<any>;

  /**
   * Creates a list of signed transactions to transfer default chain currency
   * @param payments A list of transfers to prepare
   * @param options Options
   * @returns An ordered list of signed transactions
   */
  abstract preparePays(payments: IPayOptions[], options: {}): Promise<any[]>;

  /**
   * Creates a list of signed transactions to transfer default chain currency
   * @param payments A list of transfers to prepare
   * @param options Options
   * @returns An ordered list of signed transactions
   */
  abstract prepareTransfers(
    payments: IPayOptions[],
    options: {}
  ): Promise<any[]>;

  /**
   * Creates a skeleton transaction
   */
  abstract getEmptyTransaction(): any;

  /**
   * Returns the address of the connected wallet
   */
  abstract getAddress(): string;

  /**
   * Signs a transaction using the connected wallet
   * @param raw_transaction The transaction to sign
   * @param options Options
   * @returns The signed transaction
   */
  abstract signTransaction(
    raw_transaction: any,
    options?: { privateKey?: string }
  ): Promise<any>;

  /**
   * Signs a list of transactions using the connected wallet. The transaction nonce is incremented for each transaction in order of appearance.
   *
   * @param transactions A list of transactions to sign
   * @param options Options
   */
  abstract signTransactions(
    transactions: any[],
    options?: { privateKey?: string }
  ): Promise<any[]>;
}

export abstract class DefaultChainWeb extends DefaultChain {}

/**
 * Interface for the Default Chain LocalSDK
 */
export abstract class DefaultChainLocal
  extends DefaultChain
  implements IDefaultChainLocal
{
  /**
   * Gets various infos
   */
  abstract getInfo: () => Promise<any>;
  /**
   * Broadcasts a signed transaction
   * @param tx The signed transaction
   * @returns The transaction hash
   */
  abstract sendTransaction: (signed_tx: any) => Promise<any>;
}
