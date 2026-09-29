import { Demos } from "@/websdk"
import { ContractDeployer } from "@/contracts/ContractDeployer"
import { ContractInteractor } from "@/contracts/ContractInteractor"
import { DemosTokens } from "@/websdk/DemosTokens"

/**
 * Contract and token transactions have to carry the next nonce, like
 * every other builder. They used to take the confirmed nonce as is, which
 * the node rejects ("Expected >= confirmed + 1").
 *
 * Each case runs the real builder with a connected wallet. Contract and
 * token-creation transactions are read before `sign()`, which does not
 * accept their `to` address yet; token transfers are signed for real.
 */
const CONFIRMED = 5

async function buildingDemos(): Promise<{ demos: Demos; built: any[] }> {
    const demos = new Demos()
    ;(demos as any).nodeCall = async (message: string) =>
        message === "getAddressNonce" ? CONFIRMED : null
    ;(demos as any).rpcCall = async () => ({
        result: 500,
        response: { error: "stop after build" },
    })
    await demos.connectWallet(demos.newMnemonic())

    const built: any[] = []
    jest.spyOn(demos, "sign").mockImplementation(async (tx: any) => {
        built.push(tx)
        return tx
    })
    return { demos, built }
}

const SOURCE = "export class C { run() { return 1 } }"
const CONTRACT = "0x" + "cd".repeat(32)

describe("contract builders use the next nonce", () => {
    it("deploys with confirmed + 1", async () => {
        const { demos, built } = await buildingDemos()

        await new ContractDeployer(demos).deploy(SOURCE, [], {
            validateSource: false,
        })

        expect(built).toHaveLength(1)
        expect(built[0].content.type).toBe("contractDeploy")
        expect(built[0].content.nonce).toBe(CONFIRMED + 1)
    })

    it("calls with confirmed + 1", async () => {
        const { demos, built } = await buildingDemos()

        await new ContractInteractor(demos).call(CONTRACT, "transfer", [1])

        expect(built).toHaveLength(1)
        expect(built[0].content.type).toBe("contractCall")
        expect(built[0].content.nonce).toBe(CONFIRMED + 1)
    })

    it("keeps an explicit nonce as given", async () => {
        const { demos, built } = await buildingDemos()

        await new ContractInteractor(demos).call(CONTRACT, "transfer", [1], {
            nonce: 42,
        })

        expect(built[0].content.nonce).toBe(42)
    })

    it("draws from the auto-nonce sequence when it is on", async () => {
        const { demos, built } = await buildingDemos()
        demos.enableAutoNonce()

        const interactor = new ContractInteractor(demos)
        await interactor.call(CONTRACT, "transfer", [1])
        await interactor.call(CONTRACT, "transfer", [2])

        expect(built.map(tx => tx.content.nonce)).toEqual([
            CONFIRMED + 1,
            CONFIRMED + 2,
        ])
    })
})

describe("token builders use the next nonce", () => {
    async function tokenDemos(): Promise<Demos> {
        const demos = new Demos()
        ;(demos as any).nodeCall = async (message: string) =>
            message === "getAddressNonce" ? CONFIRMED : null
        ;(demos as any)._getNetworkParametersCached = async () => null
        await demos.connectWallet(demos.newMnemonic())
        return demos
    }

    const TOKEN = {
        name: "Nonce Test",
        ticker: "NTT",
        decimals: 2,
        initialSupply: "1000",
    }

    it("creates a token with confirmed + 1", async () => {
        const tokens = new DemosTokens(await tokenDemos())

        const tx = await tokens.createToken(TOKEN)

        expect(tx.content.type).toBe("tokenCreation")
        expect(tx.content.nonce).toBe(CONFIRMED + 1)
    })

    it("builds a token transfer with confirmed + 1", async () => {
        const demos = await tokenDemos()
        const tokens = new DemosTokens(demos)

        const tx = await tokens.transfer(CONTRACT, CONTRACT, "10")
        const signed = await demos.sign(tx)

        expect(signed.content.type).toBe("tokenExecution")
        expect(signed.content.nonce).toBe(CONFIRMED + 1)
    })

    it("keeps an explicit nonce as given", async () => {
        const tokens = new DemosTokens(await tokenDemos())

        const tx = await tokens.transfer(CONTRACT, CONTRACT, "10", { nonce: 42 })

        expect(tx.content.nonce).toBe(42)
    })
})
