import forge from 'node-forge'
import { DemosWebAuth } from './DemosWebAuth'
import { required } from './utils/required'

// INFO This class is to be used as part of DemosWebAuthenticator (e.g. DemosWebAuth.getInstance().rsa().refresh())
export class RSA {
  static _instance = <RSA | null>null
  keypair = <forge.pki.rsa.KeyPair | null>null
  stringified_keypair = ""

  constructor () {}

  // INFO Singleton pattern
  static getInstance () {
    if (!RSA._instance) {
      RSA._instance = new RSA()
    }
    return RSA._instance
  }

  // INFO Generating, if possible, a RSA keypair
  // NOTE Derived from DemosWebAuth keypairs
  refresh () {
    let pre_seed = null
    if (DemosWebAuth.getInstance().stringified_keypair) {
      pre_seed = DemosWebAuth.getInstance().stringified_keypair!.privateKey
    } else throw new Error('RSA Keypair cannot be generated without a proper ECDSA authentication')
    // If we are here, we can proceed and fill DemosWebAuth instance
    const seed = this.seedForger(pre_seed)
    const pseudorandom = this.PRNG(seed)
    this.keypair = forge.pki.rsa.generateKeyPair({ bits: 4096, prng: pseudorandom })
    this.stringified_keypair = JSON.stringify(this.keypair)
  }

  // INFO Generating a pseudo-random from a seed
  PRNG (seed: any) {
    const prng = forge.random.createInstance()
    prng.seedFileSync = () => seed
    return prng
  }

  // INFO Generating a seed in the right format from a string
  seedForger (pre_seed: any) {
    const md = forge.md.sha256.create()
    md.update(pre_seed)
    return md.digest().toHex()
  }

  // INFO Encrypting a message using the RSA keypair
  self_encrypt (message: string) {
    if (!required(this.keypair)) {
      throw new Error('RSA Keypair cannot be generated without a proper ECDSA keypair')
    }
    if (!(typeof (message) === 'string')) {
      message = JSON.stringify(message)
    }
    const encoded = forge.util.encode64(message)
    const encrypted = this.keypair!.publicKey.encrypt(encoded)
    return forge.util.encode64(encrypted)
  }

  /**
	 * @param {forge.pki.rsa.PublicKey} public_key
	 */
  encrypt (public_key: { encrypt: (arg0: any) => any }, message: string) {
    if (!(typeof (message) === 'string')) {
      message = JSON.stringify(message)
    }
    const encoded = forge.util.encode64(message)
    const encrypted = public_key.encrypt(encoded)
    return forge.util.encode64(encrypted)
  }

  // INFO Decrypting a message using the RSA keypair
  decrypt (message: any) {
    if (!required(this.keypair)) {
      throw new Error('RSA Keypair cannot be generated without a proper ECDSA keypair')
    }
  
    const debased_encrypted = forge.util.decode64(message)
    const raw_decrypted = this.keypair!.privateKey.decrypt(debased_encrypted)
    const decrypted = forge.util.decode64(raw_decrypted)
    return decrypted
  }
}
