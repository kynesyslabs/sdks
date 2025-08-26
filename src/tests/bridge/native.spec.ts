import { Demos } from "@/websdk"
import { NativeBridge } from "@/bridge/nativeBridge"
import { BridgeOperation } from "@/bridge/nativeBridgeTypes"
import { EVM } from "@/multichain/localsdk/"
import { Contract, WebSocketProvider } from "ethers"
import { sleep } from "@/utils"

const liquidityTankABI = [
    // View functions
    "function getBalance(address token) view returns (uint256)",
    "function authorizedAddresses(uint256) view returns (address)",
    "function authorizedCount() view returns (uint8)",
    "function isAuthorized(address) view returns (bool)",
    "function getRequiredApprovals() view returns (uint8)",
    "function checkProposalStatus(bytes32) view returns (uint8, uint40, bool, bool)",
    "function hasApproved(bytes32, address) view returns (bool)",
    "function initialized() view returns (bool)",
    "function paused() view returns (bool)",

    // Management functions
    "function setAuthorizedAddresses(address[] addresses)",
    "function proposeNextOwners(bytes32 proposalId, address[] newOwners)",
    "function multisigTransfer(bytes32 proposalId, address token, address to, uint256 amount)",
    "function generateProposalId() returns (bytes32)",

    // Events
    "event TransferExecuted(address indexed token, address indexed to, uint256 amount)",
    "event OwnersRotated(address[] oldOwners, address[] newOwners)",
    "event ProposalCreated(bytes32 indexed proposalId, address indexed creator, uint40 deadline)",
    "event ProposalApproved(bytes32 indexed proposalId, address indexed approver, uint8 approvalCount)",
    "event ProposalExecuted(bytes32 indexed proposalId)",
]

describe("Native bridge Playground", () => {
    const rpc_url = "https://dev.node2.demos.sh"
    // const rpc_url = "http://localhost:53550"
    const demos = new Demos()
    const mnemonic = "green comfort mother science city film option length total alone laptop donor"

    let bridge: NativeBridge

    beforeAll(async () => {
        await demos.connect(rpc_url)
        await demos.connectWallet(mnemonic)

        bridge = new NativeBridge(demos)
    })

    test("Validate native bridge operation", async () => {
        const operation: BridgeOperation = {
            address: await demos.getEd25519Address(),
            from: {
                chain: "evm.eth",
                subchain: "sepolia",
                address: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',
            },
            to: {
                chain: "evm.polygon",
                subchain: "amoy",
                address: "0x5FbE74A283f7954f10AA04C2eDf55578811aeb03",
            },
            token: {
                amount: "10",
                type: "usdc"
            }
        }

        // Validates the operation params (locally), then sends to the node
        const compiled = await bridge.validate(operation)
        console.log("compiled", JSON.stringify(compiled, null, 2))

        // Confirms the compiled operation's signature, creates a tx and sends it
        // to the node using demos.confirm
        const validityData = await bridge.confirm(compiled, "!")
        console.log(validityData)

        // Broadcasts the tx to the node (same as demos.broadcast)
        const res = await bridge.broadcast(validityData)
        console.log(res)
    })

    function waitForEvent() {
        console.log("Listening to contract events ...")
        const ws_rpc = "wss://ethereum-sepolia-rpc.publicnode.com"
        const contract = new Contract("0x11c1197798d3b1caB6970577361172C00e4C5F36", JSON.stringify(liquidityTankABI), new WebSocketProvider(ws_rpc))

        contract.on("ProposalCreated", (proposalId: string, creator: string, deadline: number) => {
            console.log("ProposalCreated", proposalId, creator, deadline)
        })

        contract.addListener("*", (data: any) => {
            console.log("Event received", data)
        })

        // MAINNET LISTENERS FOR WETH
        // console.log("Test contract events")
        // const ws_rpc = "wss://mainnet.gateway.tenderly.co"
        // const contract = new Contract("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", JSON.stringify(liquidityTankABI), new WebSocketProvider(ws_rpc))

        // contract.on("ProposalCreated", (proposalId: string, creator: string, deadline: number) => {
        //     console.log("ProposalCreated", proposalId, creator, deadline)
        // })

        // contract.addListener("*", (data: any) => {
        //     console.log("Event received:", data)
        // })
    }

    test.only("Test Contract write GenerateProposalId", async () => {
        waitForEvent()

        // INFO: Connect funded key
        const evm_rpc = "https://ethereum-sepolia-rpc.publicnode.com"
        const evm = new EVM(evm_rpc)
        await evm.connect()
        await evm.connectWallet("hello library whisper end hurry impact wealth skin future virtual soup iron")

        // INFO: Write to contract and send tx
        const contract = await evm.getContractInstance("0x11c1197798d3b1caB6970577361172C00e4C5F36", JSON.stringify(liquidityTankABI))
        const proposalIdTx = await evm.writeToContract(
            contract,
            "generateProposalId",
            []
        )
        const tx = await evm.sendSignedTransaction(proposalIdTx)

        // Confirm tx execution
        const receipt = await evm.provider.waitForTransaction("0x9137198cc70f7d8be7764b0938db747867d8c4459f795f5814eca49ead146b0a")
        console.log(receipt.toJSON())

        // INFO: Take a nap. Maybe the event is late?
        await sleep(20000000)
    }, 2000000)
})
