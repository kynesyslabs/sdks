import { Identities } from "@/abstraction"
import { Demos } from "@/websdk"

describe("Referrals", () => {
    const rpc = "https://node2.demos.sh"

    const demos = new Demos()
    const identities = new Identities()

    beforeAll(async () => {
        await demos.connect(rpc)
        await demos.connectWallet("polar scale globe beauty stock employ rail exercise goat into sample embark")
    })

    test.skip("Validate referral code", async () => {
        const referralCode = "DanWT2XacFTKU"
        const referralInfo = await identities.validateReferralCode(demos, referralCode)
        console.log("referralInfo: ", referralInfo)
    })

    test.only("Get referral info", async () => {
        const referralInfo = await identities.getReferralInfo(demos, "0xa7b7d0b2dc54c4508631560c365876c1b11a866de4ee9f7e04dcdb740e4068f8")
        console.log("referralInfo: ", JSON.stringify(referralInfo, null, 2))
    })
})