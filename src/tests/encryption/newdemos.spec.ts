import { Hashing, uint8ArrayToHex } from "@/encryption"
import { Demos, DemosWebAuth } from "@/websdk"
import * as bip39 from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english"

describe("New Demos", () => {
    test.skip("Send Native tokens", async () => {
        // const rpc = "http://localhost:53550"
        const rpc = "http://node2.demos.sh:53560"

        const demos = new Demos()
        await demos.connect(rpc)
        const mnemonic = demos.newMnemonic(256)
        console.log("mnemonic: ", mnemonic)

        await demos.connectWallet("null",
            {
                algorithm: "falcon",
                dual_sign: true
            }
        )

        const tx = await demos.pay(
            "0xcb54f467d4c13f84bd4ab956e1bb3738bdd30956d2d2718e5b5ff28c40475db5",
            100,
        )

        const validityData = await demos.confirm(tx)
        expect(validityData.result).toBe(200)

        const result = await demos.broadcast(validityData)
        console.log(result)
        expect(result.result).toBe(200)
    })

    test.only("Master seed generation", async () => {
        const mnemonic = bip39.generateMnemonic(wordlist, 128)
        const seed = bip39.mnemonicToSeedSync(mnemonic)

        const mhash = Hashing.sha3_512(seed)
        const mhashHex = uint8ArrayToHex(mhash).slice(2)
        const mhashBuff = new TextEncoder().encode(mhashHex)

        const demos = new Demos()
        await demos.connectWallet(mhashBuff)
        console.log(demos.getAddress())
    })
})
