import { Demos } from "@/websdk"
import { Identities } from "@/abstraction"

describe("Web2 Identities", () => {
    // const rpc = "http://node2.demos.sh:53560"
    const rpc = "https://node2.demos.sh"
    // const rpc = "https://node2.demos.sh"

    const demos = new Demos()
    const identities = new Identities()

    beforeAll(async () => {
        await demos.connect(rpc)
        const mnemonic =
            "polar scale globe beauty stock employ rail exercise goat into sample embark"
        await demos.connectWallet(mnemonic)
    })

    test.skip("Create Web2 Proof Payload", async () => {
        const identities = new Identities()
        const payload = await identities.createWeb2ProofPayload(demos)
        console.log(payload)
    })

    test.skip("Infer Twitter Identity", async () => {
        const proof = "https://x.com/cwilvxi/status/1929985172293701751"
        const validityData = await identities.addTwitterIdentity(demos, proof)
        const res = await demos.broadcast(validityData)
        console.log(res)
    })

    test.skip("Remove Twitter Identity", async () => {
        const payload = {
            context: "twitter",
            username: "cwilvxi",
        }

        const validityData = await identities.removeWeb2Identity(demos, payload)
        console.log(validityData)

        const res2 = await demos.broadcast(validityData)
        console.log(res2)
    })

    test.skip("Add Github Identity", async () => {
        // INFO: All these proofs should work
        const proof =
            "https://gist.github.com/cwilvx/72b6dbdc51bdf13cd1c16aad020ebe95"
        // const proof = "https://gist.githubusercontent.com/cwilvx/abf8db960c16dfc7f6dc1da840852f79/raw/224478424c5e6e51f5eb60cb6aeea278d3418742/gistfile1.txt"
        // const proof =
        //     "https://raw.githubusercontent.com/cwilvx/vonage-draft-images/refs/heads/master/proof.txt"

        const validityData = await identities.addGithubIdentity(demos, proof)
        console.log(validityData)

        if (validityData.result == 200) {
            const res = await demos.broadcast(validityData)
            console.log(res)

            expect(res.result).toBe(200)
            expect(res.response["extra"]["message"]).toContain(
                "Transaction applied",
            )
        }
    })

    test.skip("Verify Github Identity", async () => {
        const res = await identities.getWeb2Identities(demos)
        console.log(JSON.stringify(res, null, 2))

        expect(res.result).toBe(200)
        expect(Array.isArray(res.response["github"])).toBe(true)
        expect(res.response["github"].length).toBeGreaterThan(0)
        expect(res.response["github"][0].username).toBe("cwilvx")
    })

    test.skip("Remove Github Identity", async () => {
        const identities = new Identities()
        const payload = {
            context: "github",
            username: "cwilvx",
        }
        const validityData = await identities.removeWeb2Identity(demos, payload)
        console.log(validityData)

        if (validityData.result == 200) {
            const res = await demos.broadcast(validityData)
            console.log(res)

            expect(res.result).toBe(200)
            expect(res.response["message"]).toContain("Transaction applied")
        }
    })

    test.skip("Get tweet", async () => {
        const tweet = await demos.web2.getTweet(
            "https://x.com/cwilvxi/status/1927048818169696329",
        )
        console.log(tweet)

        // const parser = await TwitterProofParser.getInstance()
        // const userId = await parser.getTweetUserId("https://x.com/cwilvxi/status/1927048818169696329")
        // console.log(userId)
    })

    test.skip("Infer Discord Identity", async () => {
        const proof =
            "https://discord.com/channels/1412035096772481097/1412035289526046750/1412158023174193202"
        const validityData = await identities.addDiscordIdentity(demos, proof)
        console.log("validityData", validityData)

        expect(validityData.result).toBe(200)

        const res = await demos.broadcast(validityData)
        console.log("res", res)

        expect(res.result).toBe(200)
    })

    test.skip("Verify Discord Identity", async () => {
        const res = await identities.getWeb2Identities(demos)
        console.log("res", res)

        console.log(JSON.stringify(res, null, 2))

        expect(res.result).toBe(200)
        expect(Array.isArray(res.response["discord"])).toBe(true)
        expect(res.response["discord"].length).toBeGreaterThan(0)
        expect(res.response["discord"][0].username).toBe("hak666")
    })

    test("Remove Discord Identity", async () => {
        const payload = {
            context: "discord",
            username: "hak666",
        }

        const validityData = await identities.removeWeb2Identity(demos, payload)
        console.log("validityData", validityData)

        expect(validityData.result).toBe(200)

        const res = await demos.broadcast(validityData)
        console.log("res", res)

        expect(res.result).toBe(200)
    })
})
