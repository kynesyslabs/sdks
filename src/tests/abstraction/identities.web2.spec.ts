import { Cryptography } from "@/encryption/Cryptography"
import { HexToForge } from "@/utils/dataManipulation"
import { DemosWebAuth, Demos } from "@/websdk"
import { Client, auth } from "twitter-api-sdk"
import forge from "node-forge"
import axios from "axios"
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
            {
                algorithm: "falcon"
            }
        )
    })

    test.skip("Create Twitter Identity", async () => {
        const payload = await identities.createWeb2ProofPayload(demos)
        console.log(payload)
    })

    test.skip("Create Web2 Proof Payload", async () => {
        const identities = new Identities()
        const payload = await identities.createWeb2ProofPayload(demos)
        console.log(payload)
    })

    test.skip("Infer Twitter Identity", async () => {
        const proof = "https://x.com/cwilvxi/status/1921817774764032186"
        const payload: InferFromTwitterPayload = {
            context: "twitter",
            proof,
        }

        const validityData = await identities.inferWeb2Identity(demos, payload)
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
        const proof = "https://gist.github.com/cwilvx/72b6dbdc51bdf13cd1c16aad020ebe95"
        // const proof = "https://gist.githubusercontent.com/cwilvx/abf8db960c16dfc7f6dc1da840852f79/raw/224478424c5e6e51f5eb60cb6aeea278d3418742/gistfile1.txt"
        // const proof =
        //     "https://raw.githubusercontent.com/cwilvx/vonage-draft-images/refs/heads/master/proof.txt"

        const validityData = await identities.addGithubIdentity(demos, proof)
        console.log(validityData)

        if (validityData.result == 200) {
            const res = await demos.broadcast(validityData)
            console.log(res)

            expect(res.result).toBe(200)
            expect(res.response["message"]).toContain("Transaction applied")
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
})
