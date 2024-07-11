import chainProviders from "@/tests/multichain/chainProviders"
import { getNewUID } from "."
import { DemosWork, prepareDemosWorkPayload } from "../work"
import { prepareWeb2Step, prepareXMStep } from "../workstep"

import { EVM } from "@/multichain/core"
import { XmStepResult } from "@/types/demoswork/steps"
import { DemosWebAuth, skeletons } from "@/websdk"

export default async function () {
    const work = new DemosWork()

    const uid = getNewUID()
    const evm = await EVM.create(chainProviders.eth.sepolia)
    await evm.connectWallet(
        "e0a00e307c21850cde41b18bae307a492c471b463b60ce5b631fdb80503b23f7",
    )
    const payload = await evm.preparePay(evm.getAddress(), "0.0001")
    const sendEth = prepareXMStep({
        operations: {
            uid: {
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

    const sendMoreEth = prepareXMStep("payload" as any)
    sendMoreEth.description = "Send more ETH"

    const web2request = skeletons.web2_request
    web2request.raw.action = "POST"
    web2request.raw.url = "https://myapi.com"

    // INFO: Send the output of the sendEth step as a parameter
    // REVIEW: Is this where the hash should go?
    web2request.raw.parameters = [
        {
            hash: sendEth.output.hash,
        },
    ]

    web2request.raw.headers = null
    web2request.raw.minAttestations = 2

    const sendHash = prepareWeb2Step(web2request)
    sendHash.description = "Send xm hash to HTTP API"

    work.if(sendEth.output.result, "==", XmStepResult.success)
        .then(sendHash)
        .elif(sendEth.output.result, "==", XmStepResult.error)
        .then(sendHash)
        .else(sendHash)

    const script = work.toJSON()
    console.log(script)

    // INFO: Create private key and return the signed transaction
    await DemosWebAuth.getInstance().create()
    return await prepareDemosWorkPayload(work)
}
