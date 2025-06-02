import { Cryptography } from "@/encryption/Cryptography"
import { HexToForge } from "@/utils/dataManipulation"
import { DemosWebAuth, Demos } from "@/websdk"
import forge from "node-forge"
import { Identities, InferFromTwitterPayload } from "@/abstraction"

describe("Web2 Identities", () => {
    const rpc = "http://localhost:53550"
    // const rpc = "https://demos.mungaist.com"

    const demos = new Demos()
    const identities = new Identities()

    beforeAll(async () => {
        await demos.connect(rpc)
        await demos.connectWallet(
            "2befb9016e8a39a6177fe8af8624c763da1a6f51b0e7c6ebc58d62749c5c68d55a6f62c7335deb2672a6217c7594c7af9f0fae0e84358673ba268f6901287928",
        )
    })

    test.skip("Create Twitter Identity", async () => {
        const identity = new DemosWebAuth()
        await identity.login(
            "60b66ef65fab761a776e4e86d175ec3a39892ae9202e7eb5a0c4bcce99db0cb3be065600833f72f3ff4d2f0ed16cc663bbd31ba607ebca0a6748ae3f98665492",
        )

        console.log("privateKey", identity.keypair.privateKey.toString("hex"))
        console.log("publicKey", identity.keypair.publicKey.toString("hex"))

        const message = "hi"
        const signature = Cryptography.sign(
            message,
            identity.keypair.privateKey,
        )
        console.log("signature", signature)

        const payload = {
            message,
            signature: signature.toString("hex"),
            publicKey: identity.keypair.publicKey.toString("hex"),
        }

        console.log("payload", payload)

        const verified = Cryptography.verify(
            message,
            forge.util.binary.hex.decode(payload.signature),
            forge.util.binary.hex.decode(payload.publicKey),
        )
        console.log("verified", verified)
    })

    test.skip("Create Web2 Proof Payload", async () => {
        const identities = new Identities()
        const payload = await identities.createWeb2ProofPayload(demos.keypair)
        console.log(payload)

        // recover payload
        const recovered = payload.split(":")
        const recoveredPayload = {
            message: recovered[1],
            signature: recovered[2],
            publicKey: recovered[3],
        }

        const verified = Cryptography.verify(
            recoveredPayload.message,
            forge.util.binary.hex.decode(recoveredPayload.signature),
            forge.util.binary.hex.decode(recoveredPayload.publicKey),
        )
        expect(verified).toBe(true)
    })

    test.only("Infer Twitter Identity", async () => {
        const proof = "https://x.com/cwilvxi/status/1927048818169696329"
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
        // const proof = "https://gist.github.com/cwilvx/abf8db960c16dfc7f6dc1da840852f79"
        // const proof = "https://gist.githubusercontent.com/cwilvx/abf8db960c16dfc7f6dc1da840852f79/raw/224478424c5e6e51f5eb60cb6aeea278d3418742/gistfile1.txt"
        const proof = "https://raw.githubusercontent.com/cwilvx/vonage-draft-images/refs/heads/master/proof.txt"

        const validityData = await identities.addGithubIdentity(demos, proof)
        console.log(validityData)

        if (validityData.result == 200) {
            const res = await demos.broadcast(validityData)
            console.log(res)

            expect(res.result).toBe(200)
            expect(res.response['message']).toContain("Transaction applied")
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
            expect(res.response['message']).toContain("Transaction applied")
        }
    })

    test.skip("Get tweet", async () => {
        const tweet = await demos.web2.getTweet("https://x.com/cwilvxi/status/1927048818169696329")
        console.log(tweet)

        // const parser = await TwitterProofParser.getInstance()
        // const userId = await parser.getTweetUserId("https://x.com/cwilvxi/status/1927048818169696329")
        // console.log(userId)
    })
})
