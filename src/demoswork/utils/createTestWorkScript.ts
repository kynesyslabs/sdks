import chainProviders from "@/tests/multichain/chainProviders"
import { getNewUID } from "."
import { DemosWork, prepareDemosWorkPayload } from "../work"
import { prepareWeb2Step, prepareXMStep } from "../workstep"

import { EVM } from "@/multichain/core"
import { XmStepResult } from "@/types/demoswork/steps"
import { DemosWebAuth } from "@/websdk"
import { Transaction } from "@/types"
import { ConditionalOperation } from "../operations/conditional"

export default async function createTestWorkScript(): Promise<Transaction> {
    const work = new DemosWork()

    const uid = getNewUID()
    const evm = await EVM.create(chainProviders.eth.sepolia)
    await evm.connectWallet(
        "e0a00e307c21850cde41b18bae307a492c471b463b60ce5b631fdb80503b23f7",
    )
    const payload = await evm.preparePay(evm.getAddress(), "0.0001")
    const sendEth = prepareXMStep({
        operations: {
            [uid]: {
                chain: "eth",
                is_evm: true,
                rpc: null,
                subchain: "sepolia",
                task: {
                    params: null,
                    signedPayloads: [payload],
                    type: "pay",
                },
            },
        },
        operations_order: [uid],
    })
    sendEth.description = "Send ETH"

    // WEB2 STEP
    const sendHash = prepareWeb2Step(
        "POST",
        "https://icanhazip.com",
        null,
        null,
        null,
        2,
    )
    sendHash.description = "Send xm hash to HTTP API"

    const operation = new ConditionalOperation()
    operation
        .if(sendEth.output.result, "==", XmStepResult.success)
        .then(sendHash)
        .elif(sendEth.output.result, "==", XmStepResult.error)
        .then(sendHash)

    work.push(operation)
    const script = work.toJSON()
    console.log(script)

    // INFO: Create private key and return the signed transaction
    await DemosWebAuth.getInstance().create()
    return await prepareDemosWorkPayload(work)
}
