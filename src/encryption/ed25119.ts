import { signedObject, UnifiedCrypto } from "./unifiedCrypto"

export class Ed25519 {
    crypto: UnifiedCrypto

    get keypair(){
        // TODO: fix
        return this.crypto.getIdentity("ed25519")
    }

    create(masterSeed: string){
        // TODO: convert the master seed into a 128 byte buffer
        const seedBuffer = new TextEncoder().encode(masterSeed)
        this.crypto.generateIdentity("ed25519", seedBuffer)
    }

    sign(data: string) {
        const dataUint8Array = new TextEncoder().encode(data)
        return this.crypto.sign("ed25519", dataUint8Array)
    }

    verify(payload: signedObject) {
        return this.crypto.verify(payload)
    }
}
