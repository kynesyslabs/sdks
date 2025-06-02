import { Hashing, uint8ArrayToHex } from "@/encryption"
import { Demos, DemosWebAuth } from "@/websdk"
import * as bip39 from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english"

describe("New Demos", () => {
    test.only("Send Native tokens", async () => {
        const rpc = "http://localhost:53550"

        const identity = DemosWebAuth.getInstance()
        await identity.login(
            "0x8ef606ad922ae1ce88fa8b245b8dbcff5b5a5ca1b21c594be0c505af6f5317471060ab12b16a7385351fd6ebf0029cc9bcf4dcb2bdb49093368ce4b511f4f1ad",
        )

        const demos = new Demos()
        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey as Uint8Array,
            {
                algorithm: "falcon",
                dual_sign: true
            }
        )

        const tx = await demos.pay(
            identity.keypair.publicKey.toString("hex"),
            100,
        )

        const validityData = await demos.confirm(tx)
        expect(validityData.result).toBe(200)

        const result = await demos.broadcast(validityData)
        console.log(result)
        expect(result.result).toBe(200)
    })

    test.skip("Master seed stuff", async () => {
        const mnemonic = bip39.generateMnemonic(wordlist, 128)
        console.log(mnemonic)

        const seed = bip39.mnemonicToSeedSync(mnemonic)

        const mhash = Hashing.sha3_512(seed)
        const mhashHex = uint8ArrayToHex(mhash).slice(2)
        console.log("mhash hex length: ", mhashHex.length)

        const mhashBuff = new TextEncoder().encode(mhashHex)
        console.log("mhash buff length: ", mhashBuff.length)

        const demos = new Demos()
        await demos.connectWallet(mhashBuff)
        console.log(demos.getAddress())
    })
})
