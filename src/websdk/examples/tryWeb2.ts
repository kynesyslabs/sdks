import { demos } from "../demos"
import { EnumWeb2Methods } from "../../types"
import { DemosWebAuth } from "../DemosWebAuth"
import { Demos } from "../demosclass"

async function tryWeb2Proxy() {
    try {
        // Connect to demos
        const demos = new Demos()
        await demos.connect("http://localhost:53550")
        console.log("Connected to demos")

        // Set up wallet
        const identity = DemosWebAuth.getInstance()
        await identity.create()
        await demos.connectWallet(identity.keypair.privateKey as Buffer)
        console.log("Wallet connected")

        // Create proxy instance
        const dahr = await demos.web2.createDahr(demos)
        console.log("Created proxy with sessionId:", dahr.sessionId)

        // Make request
        const response = await dahr.startProxy({
            url: "https://icanhazip.com",
            method: EnumWeb2Methods.GET,
        })
        console.log("Response:", response)

        // Cleanup
        await dahr.stopProxy()
        console.log("Stopped proxy")
    } catch (error) {
        console.error("Error:", error)
    }
}

// tryWeb2Proxy()
