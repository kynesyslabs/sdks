// LINK https://github.com/s0l0ist/node-seal/blob/main/USAGE.md
// LINK https://s0l0ist.github.io/seal-sandbox/
import SEAL from 'node-seal'
import { EncryptionParameters } from 'node-seal/implementation/encryption-parameters';
import { SEALLibrary } from 'node-seal/implementation/seal';

// Initialize SEAL completely
let seal: SEALLibrary = null;
(async() => {
    seal = await SEAL();
})();

export default class FHE {

    // Properties
    public schemeType: any
    public securityLevel: any
    public polyModulusDegree: number
    public bitSizes: number[]
    public bitSize: number
    public parms: EncryptionParameters
    
    constructor() {
        // Encryption Parameters
        this.schemeType = seal.SchemeType.bfv;
        this.securityLevel = seal.SecurityLevel.tc128
        this.polyModulusDegree = 4096
        this.bitSizes = [36,36,37]
        this.bitSize = 20
        // Create the parameters object
        this.parms = seal.EncryptionParameters(this.schemeType)
        // TODO Continue from here
    }

}