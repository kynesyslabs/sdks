import { DemosWork, prepareDemosWorkPayload } from "@/demoswork/work"
import { Web2WorkStep, XmWorkStep } from "@/demoswork/workstep"
import { XmStepResult } from "@/types/demoswork/steps"

import {
    BaseOperation,
    Condition,
    ConditionalOperation,
    prepareWeb2Step,
    prepareXMStep,
} from "@/demoswork"
import createTestScript from "@/demoswork/utils/createTestWorkScript"
import { EVM } from "@/multichain/websdk"
import pprint from "@/utils/pprint"
import { demos, DemosWebAuth } from "@/websdk"
import { prepareXMScript } from "@/websdk/XMTransactions"
import { wallets } from "./utils/wallets"
import { EnumWeb2Methods } from "@/types"

describe("Demos Workflow", () => {
    test.only("cheatsheet: workstep output dynamic acess", () => {
        // SECTION: WorkStep ouput access cheatsheet
        const getBTCPrice = prepareWeb2Step({
            url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
            method: EnumWeb2Methods.GET,
        })

        // 1. reference base output
        const base_output = getBTCPrice.base_output
        console.log("base_output", base_output)

        // Or.

        const still_base_output = getBTCPrice.output // when you don't need typings
        console.log("still base_output", still_base_output)

        // 2. reference arbitrary keys
        const level1 = getBTCPrice.output.bitcoin
        console.log("level1", level1)

        // OR

        const still_level1 = getBTCPrice.output["bitcoin"]
        console.log("still level1 nesting", still_level1)

        // 3. reference nested keys
        const nestedValue = getBTCPrice.output["bitcoin.usd"]
        console.log("nestedValue", nestedValue)

        // !SECTION
    })

    test.only("Example usage", () => {
        const getBTCPrice = prepareWeb2Step({
            url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
            method: EnumWeb2Methods.GET,
        })

        const pingNode = prepareWeb2Step({
            url: "https://mungaist.com",
            method: EnumWeb2Methods.GET,
        })

        const isGreater = new Condition({
            value_a: getBTCPrice.output["bitcoin.usd"],
            operator: ">",
            value_b: 60000,
            action: pingNode,
        })

        const operation = new ConditionalOperation(isGreater)
        pprint(operation)
    })

    test("Creating a demoswork tx", async () => {
        const tx = await createTestScript()
        pprint(tx)
    })

    test.skip("depends on + critical", () => {
        const operation = new ConditionalOperation()

        console.log("operation", operation)
        console.log("operation.depends_on", operation.depends_on)
        console.log("operation.critical", operation.critical)

        operation.depends_on.push("step_1")
        operation.depends_on.push("step_2")

        operation.critical = false
        console.log("operation.depends_on", operation.depends_on)
        console.log("operation.critical", operation.critical)
    })

    test.skip("base operation", async () => {
        const base = new BaseOperation()
        const checkBTCPrice = prepareWeb2Step({
            url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
            method: EnumWeb2Methods.GET,
        })

        const checkEthPrice = prepareWeb2Step({
            url: "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
            method: EnumWeb2Methods.GET,
        })

        base.addWork(checkBTCPrice, checkEthPrice)
        pprint(base)
    })

    test.only("conditional", async () => {
        // Web2 step to do a GET API call
        const address = "0x8A6575025DE23CB2DcB0fE679E588da9fE62f3B6"
        const isMember = prepareWeb2Step({
            url: `https://api.[redacted].com/v1/eth_sepolia/address/${address}`,
            method: EnumWeb2Methods.GET,
        })
        isMember.description = "Check if address is a member"

        // Web2 step to do a POST API call
        const addMember = prepareWeb2Step({
            url: `https://api.[redacted].com/v1/eth_sepolia/address/${address}?key=ckey_5a044cf0034a43089e6b308b023`,
            method: EnumWeb2Methods.POST,
        })

        // XM step to send ETH
        const evm = await EVM.create("https://rpc.ankr.com/eth_sepolia")
        await evm.connectWallet(wallets.evm.privateKey)
        const payload = await evm.prepareTransfer(address, "0.25")

        const xmscript = prepareXMScript({
            chain: "eth",
            subchain: "sepolia",
            type: "pay",
            signedPayloads: [payload],
        })
        const releaseFunds = prepareXMStep(xmscript)

        // Conditional operation
        // ==============================
        let operation = new ConditionalOperation()
        operation.depends_on.push(isMember.id)
        operation
            .if(isMember.output.statusCode, "==", 200)
            .then(releaseFunds)
            .else(addMember)

        // ==============================

        // const checkIsMember = new Condition({
        //     value_a: isMember.output.statusCode,
        //     operator: "==",
        //     value_b: 200,
        //     action: releaseFunds,
        // })

        // const notMember = new Condition({
        //     value_a: null,
        //     operator: null,
        //     value_b: null,
        //     action: addMember,
        // })

        // operation = new ConditionalOperation(checkIsMember, notMember)

        const work = new DemosWork()
        work.push(operation)

        const identity = DemosWebAuth.getInstance()
        await identity.create()

        const tx = await prepareDemosWorkPayload(work, identity.keypair)
        pprint(tx)

        const rpc_url = "https://mungaist.com"
        await demos.connect(rpc_url)
        await demos.connectWallet(identity.keypair.privateKey as any)

        const validityData = await demos.confirm(tx)
        pprint(validityData)

        const res = await demos.broadcast(validityData)

        pprint(res)
    })

    test.skip("workstep", async () => {
        // const step = prepareWeb2Step({ method: EnumWeb2Methods.GET, url: "https://google.com" })
        // const evm_key = process.env.EVM_KEY
        const evm_key = wallets.evm.privateKey

        const evm_rpc = "https://rpc.ankr.com/eth_sepolia"

        const evm = await EVM.create(evm_rpc)
        await evm.connectWallet(evm_key)

        const payload = await evm.prepareTransfer(
            "0x8A6575025DE23CB2DcB0fE679E588da9fE62f3B6",
            "0.25",
        )
        const xmscript = prepareXMScript({
            chain: "eth",
            subchain: "sepolia",
            type: "pay",
            signedPayloads: [payload],
        })

        const step = prepareXMStep(xmscript)

        pprint(step)
    })

    test("It works", async () => {
        const work = new DemosWork()

        const action = prepareWeb2Step({
            method: EnumWeb2Methods.GET,
            url: "https://google.com",
        })
        const action2 = prepareWeb2Step({
            method: EnumWeb2Methods.GET,
            url: "https://youtube.com",
        })
        action.description = "Google"

        const condition1 = new Condition({
            value_a: action.output.statusCode,
            operator: "==",
            value_b: 200,
            action: action2,
        })

        const fallback = new Condition({
            operator: null,
            value_a: null,
            value_b: null,
            action: action2,
        })

        const operation = new ConditionalOperation(condition1, fallback)

        const conditionMain = new Condition({
            value_a: "value_c",
            operator: "==",
            value_b: "value_d",
            action: operation,
        })

        const fallbackActionMain = prepareWeb2Step({
            url: "https://icanhazip.com",
            method: EnumWeb2Methods.GET,
        })
        fallbackActionMain.description = "IcanhaZIP"

        const fallbackMain = new Condition({
            operator: null,
            value_a: null,
            value_b: null,
            action: fallbackActionMain,
        })

        const mainConditional = new ConditionalOperation(
            fallbackMain,
            conditionMain,
        )

        work.push(mainConditional)

        const identity = DemosWebAuth.getInstance()
        await identity.create()

        const tx = await prepareDemosWorkPayload(work, identity.keypair)
        pprint(tx)
    })

    test("it works", async () => {
        const work = new DemosWork()

        const sendEth = new XmWorkStep("payload" as any)
        sendEth.description = "Send ETH"
        // sendEth.sign("privateKey")

        const sendHash = new Web2WorkStep({
            url: "https://myapi.com",
            method: "POST",
            data: {
                hash: sendEth.output.hash,
            },
        } as any)
        sendHash.description = "Send xm hash to HTTP API"

        //              WorkStep | Workstep property | value
        const op1 = new ConditionalOperation()
        op1.if(sendEth.output.result, "==", XmStepResult.success).then(sendHash)

        const equalityCondition = new Condition({
            value_a: XmStepResult.success,
            value_b: sendEth.output.result,
            operator: "==",
            // action: sendHash,
        })

        const equalityCondition2 = new Condition({
            value_a: XmStepResult.success,
            value_b: sendEth.output.result,
            operator: "==",
        })

        const equalityCondition3 = new Condition({
            value_a: equalityCondition,
            value_b: equalityCondition2,
            operator: "==",
        })

        const notOperation = new Condition({
            value_a: equalityCondition,
            operator: "not",
            action: sendHash,
        })

        const op2 = new ConditionalOperation(notOperation)

        // const op1_ = new ConditionalOperation(equalityCondition)
        // const op2 = new ConditionalOperation()
        // op2.if(equalityCondition, "not")
        //     .then(sendHash)
        //     .else(op1)

        const baseOp = new BaseOperation(op2)

        work.push(baseOp)

        // pprint(work)
        pprint(work.toJSON())

        // const loaded = work.fromJSON(work.toJSON())

        // const res = await loaded.execute()
        // pprint(res)
        // pprint(loaded.results)
    })
})
