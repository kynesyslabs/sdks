import { Cryptography } from "@/encryption/Cryptography"
import { HexToForge } from "@/utils/dataManipulation"
import { DemosWebAuth, Demos } from "@/websdk"
import { Client, auth } from "twitter-api-sdk"
import forge from "node-forge"
import axios from "axios"
import { Identities, InferFromTwitterPayload } from "@/abstraction"

describe("Web2 Identities", () => {
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
        const rpc = "http://localhost:53550"
        const demos = new Demos()
        // await demos.connect(rpc)

        const identity = new DemosWebAuth()
        await identity.login(
            "2befb9016e8a39a6177fe8af8624c763da1a6f51b0e7c6ebc58d62749c5c68d55a6f62c7335deb2672a6217c7594c7af9f0fae0e84358673ba268f6901287928",
        )
        await demos.connectWallet(identity.keypair.privateKey as Uint8Array)
        demos.keypair

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

    test.skip("Infer Twitter Identity", async () => {
        // const rpc = "http://localhost:53550"
        const rpc = "https://demos.mungaist.com"
        const proof = "https://x.com/cwilvxi/status/1904144804499304524"
        const payload: InferFromTwitterPayload = {
            context: "twitter",
            proof,
        }

        const identity = new DemosWebAuth()
        await identity.login(
            "2befb9016e8a39a6177fe8af8624c763da1a6f51b0e7c6ebc58d62749c5c68d55a6f62c7335deb2672a6217c7594c7af9f0fae0e84358673ba268f6901287928",
        )

        const demos = new Demos()
        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey as Uint8Array)

        const identities = new Identities()
        const validityData = await identities.inferWeb2Identity(demos, payload)
        const res = await demos.broadcast(validityData)
        console.log(res)
    })

    test.skip("Remove Twitter Identity", async () => {
        // const rpc = "http://localhost:53550"
        const rpc = "https://demos.mungaist.com"
        const demos = new Demos()
        await demos.connect(rpc)

        const identity = new DemosWebAuth()
        await identity.login(
            "2befb9016e8a39a6177fe8af8624c763da1a6f51b0e7c6ebc58d62749c5c68d55a6f62c7335deb2672a6217c7594c7af9f0fae0e84358673ba268f6901287928",
        )
        await demos.connectWallet(identity.keypair.privateKey as Uint8Array)

        const identities = new Identities()
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
        // const proof = "https://gist.github.com/cwilvx/abf8db960c16dfc7f6dc1da840852f79"
        // const proof = "https://gist.githubusercontent.com/cwilvx/abf8db960c16dfc7f6dc1da840852f79/raw/224478424c5e6e51f5eb60cb6aeea278d3418742/gistfile1.txt"
        const proof = "https://raw.githubusercontent.com/cwilvx/vonage-draft-images/refs/heads/master/proof.txt"
        // const rpc = "https://demos.mungaist.com"
        const rpc = "http://localhost:53550"
        const demos = new Demos()
        await demos.connect(rpc)

        const identity = new DemosWebAuth()
        await identity.login(
            "2befb9016e8a39a6177fe8af8624c763da1a6f51b0e7c6ebc58d62749c5c68d55a6f62c7335deb2672a6217c7594c7af9f0fae0e84358673ba268f6901287928",
        )
        await demos.connectWallet(identity.keypair.privateKey as Uint8Array)

        const identities = new Identities()
        const validityData = await identities.addGithubIdentity(demos, proof)
        console.log(validityData)

        if (validityData.result == 200) {
            const res = await demos.broadcast(validityData)
            console.log(res)
        }
    })

    test.only("Remove Github Identity", async () => {
        const rpc = "http://localhost:53550"
        const demos = new Demos()
        await demos.connect(rpc)

        const identity = new DemosWebAuth()
        await identity.login(
            "2befb9016e8a39a6177fe8af8624c763da1a6f51b0e7c6ebc58d62749c5c68d55a6f62c7335deb2672a6217c7594c7af9f0fae0e84358673ba268f6901287928",
        )
        await demos.connectWallet(identity.keypair.privateKey as Uint8Array)

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
        }
    })
})
