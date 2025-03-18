import { Cryptography } from "@/encryption"
import { HexToForge } from "@/utils/dataManipulation"
import { DemosWebAuth, Demos } from "@/websdk"
import { Client, auth } from "twitter-api-sdk"
import forge from "node-forge"
import axios from "axios"
import { Identities, InferFromTwitterPayload } from "@/abstraction"

describe("Web2 Identities", () => {
    test("Create Twitter Identity", async () => {
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
    test.skip("Get tweets via Twitter API SDK", async () => {
        const twitter = new Client(process.env.TWITTER_BEARER)
        const res = await twitter.tweets.findTweetById("1901630063692365884", {
            expansions: ["author_id"],
            "user.fields": ["username"],
        })

        console.log(res)
    })

    test.skip("Get tweets via Axios", async () => {
        const id = "1901630063692365884"
        const params = {
            ids: id,
            "user.fields": "created_at",
        }
        const url =
            `https://api.twitter.com/2/tweets` +
            "?" +
            new URLSearchParams(params).toString()

        console.log(url)

        const res = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${process.env.TWITTER_BEARER}`,
            },
            params,
        })
        console.log(res.data)
    })

    test.only("Infer Twitter Identity", async () => {
        const rpc = "http://localhost:53550"
        const payload: InferFromTwitterPayload = {
            context: "twitter",
            proof: "https://x.com/demos_xyz/status/1901630063692365884",
        }

        const identity = new DemosWebAuth()
        await identity.create()

        const demos = new Demos()
        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey as Uint8Array)

        const identities = new Identities()
        const validityData = await identities.inferWeb2Identity(demos, payload)
        const res = await demos.broadcast(validityData)
        console.log(res)
    })
})
