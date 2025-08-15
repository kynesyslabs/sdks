import required from '../../utils/required'
const TronWeb = require('tronweb')
import DefaultChainAsync from './types/defaultChainAsync'

export default class TRON extends DefaultChainAsync {

  provider = null
  wallet = null
  rpc_url = null
  connected = false

  // NOTE We init TRON with await TRON.create(rpc_url)
  // This is necessary to ensure that the provider is connected
  // if the user specifies the rpc_url in the constructor,
  // as we cannot use await in the constructor
  constructor (rpc_url = null) {
    super(rpc_url)
    if (rpc_url) {
      this.setRPC(rpc_url)
    }
    this.wallet = null
    this.provider = null
  }

  // INFO Set of methods for connecting to an RPC while
  // retaining a granular control over the instance status
  async setRPC (rpc_url: string) {
    this.rpc_url = rpc_url
    this.provider = new TronWeb({
      fullHost: this.rpc_url
		  })
  }

  async connect () {
    return this.provider
  }

  static async create (rpc_url = null) {
    const instance = new TRON(rpc_url)
    if (rpc_url) { await instance.connect() }
    return instance
  }

  // INFO Connecting a wallet through a private key (string)
  async connectWallet (privateKey: string, api_key = '') {
    required(this.provider, true)

    this.wallet = new TronWeb({
      fullHost: 'https://api.shasta.trongrid.io',
      privateKey,
      headers: { 'TRON-PRO-API-KEY': api_key }
    })
  }

  // INFO Signing a transaction
  // with a private key or by using our stored wallet
  async signTransaction (transaction: Transaction, privateKey = null) {
    // TODO
  }

  // SECTION Specific methods

  // INFO transfer and pay are the same
  async prepareTransfer (address: any, amount: any) {
    await this.preparePay(address, amount)
  }

  async preparePay (address: string, amount: string) {
    required(this.wallet, true)
    // TODO
  }

  // INFO Generic empty tx skeleton for this chain
  async getEmptyTransaction () {
    // TODO
  }

  // SECTION Unimplemented methods

  getBalance(address: string): Promise<string> {
    throw new Error('Method not implemented.')
  }
  getAddress(): string {
    throw new Error('Method not implemented.')
  }
}
