import { Identities } from "@/abstraction"
import { Hashing, uint8ArrayToHex } from "@/encryption"
import { Demos, DemosWebAuth } from "@/websdk"
import * as bip39 from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"

describe("New Demos", () => {
    test.skip("Send Native tokens", async () => {
        // const rpc = "https://node2.demos.sh"
        const rpc = "http://node2.demos.sh:53560"
        // const rpc = "https://node2.demos.sh"

        const demos = new Demos()
        await demos.connect(rpc)
        const mnemonic = demos.newMnemonic()
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

    test.skip("Master seed generation", async () => {
        const mnemonic = bip39.generateMnemonic(wordlist, 128)
        const seed = bip39.mnemonicToSeedSync(mnemonic)

        const mhash = Hashing.sha3_512(seed)
        const mhashHex = uint8ArrayToHex(mhash).slice(2)
        const mhashBuff = new TextEncoder().encode(mhashHex)

        const demos = new Demos()
        await demos.connectWallet(mhashBuff)
        console.log(demos.getAddress())
    })


    test.skip("Mnemonic to keypair", async () => {
        const mnemonic = "symbol crew island order tumble document grocery art lake olive wall obvious"
        const demos = new Demos()
        await demos.connectWallet(mnemonic)

        const pubkey = await demos.getEd25519Address()
        expect(pubkey).toBe("0x6d43826dfb8b61c4276a33a94539e3cd27250435918336f56fe8de7e4c2e3534")
    })

    test.skip("Generate 6 new mnemonics", async () => {
        const keys = {}

        for (let i = 0; i < 6; i++) {
            const demos = new Demos()
            const mnemonic = demos.newMnemonic(256)

            await demos.connectWallet(mnemonic)
            const pubkey = await demos.getEd25519Address()
            keys[pubkey] = mnemonic
        }

        console.log(JSON.stringify(keys, null, 2))
    })

    test.skip("get address balance", async () => {
        const demos = new Demos()
        await demos.connect("https://node2.demos.sh")
        await demos.connectWallet("valve female novel job because banana abuse divorce host travel own jewel gauge raw girl stumble judge silent target tonight ability ordinary acoustic series")

        // const pubkey = "0x10bf4da38f753d53d811bcad22e0d6daa99a82f0ba0dbbee59830383ace2420c"
        const pubkey = await demos.getEd25519Address()
        const balance = await demos.getAddressInfo(pubkey)
        console.log(balance)
    })

    test.skip("get campaign data", async () => {
        const mnemonic = "clock coffee open foam tell price urban deposit stadium motor since cover cushion recall chat master fabric arrange embrace zebra kind congress scene dutch"
        const demos = new Demos()
        await demos.connectWallet(mnemonic)
        // await demos.connect("https://demosnode.discus.sh")
        await demos.connect("https://node2.demos.sh")

        const campaignData = await demos.call("getCampaignData", null)
        console.log(campaignData)
    })

    test.skip("check is bot", async () => {
        const demos = new Demos()
        await demos.connect("https://node2.demos.sh")

        // const user = {
        //     username: "elydiem95",
        //     userId: "1683070476778872832",
        // }

        const user = {
            username: "cwilvxi",
            userId: "1901628527981568000",
        }

        // const user = {
        //     username: "quocnguyen21044",
        //     userId: "1854458184792162304"
        // }

        // const user = {
        //     username: "lethiha1996",
        //     userId: "1662297995457736704"
        // }

        // const user = {
        //     username: "tcookingsenpai",
        //     userId: "1781036248972378112"
        // }

        // const user = {
        //     username: "CathrynQua66392",
        //     userId: "1663943214683004930"
        // }

        const isBot = await demos.nodeCall("checkIsBot", {
            username: user.username,
            userId: user.userId,
        })

        console.log(isBot)
    })

    test.skip("rate limit unblock", async () => {
        const demos = new Demos()
        await demos.connect("https://node2.demos.sh")
        await demos.connectWallet("clock coffee open foam tell price urban deposit stadium motor since cover cushion recall chat master fabric arrange embrace zebra kind congress scene dutch")

        const unblocked = await demos.call("rate-limit/unblock", [
            "127.0.0.1",
        ])
        console.log(unblocked)
    })

    test.skip("get address info", async () => {
        const demos = new Demos()
        await demos.connect("https://node2.demos.sh")
        await demos.connectWallet("clock coffee open foam tell price urban deposit stadium motor since cover cushion recall chat master fabric arrange embrace zebra kind congress scene dutch")

        const addressInfo = await demos.nodeCall("getAddressInfo", {
            address: "0xcb54f467d4c13f84bd4ab956e1bb3738bdd30956d2d2718e5b5ff28c40475db5",
        })
        console.log(addressInfo)
    })

    test.skip("get transaction history", async () => {
        const demos = new Demos()
        // await demos.connect("https://node2.demos.sh")
        await demos.connect("https://node2.demos.sh")
        // await demos.connectWallet("clock coffee recall chat master fabric arrange embrace zebra kind congress scene dutch")

        const transactionHistory = await demos.getTransactionHistory("0xf70270e8664000d392141d6281a652b23704097dbdbc5a4239cee7f4a701f2d1", "all", {
            start: 1,
            limit: 2
        })
        console.log(transactionHistory)
    })
})
