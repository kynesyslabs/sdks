import chainProviders from "@/tests/multichain/chainProviders"
import { getNewUID } from "@/demoswork/utils"
import { DemosWork, prepareDemosWorkPayload } from "@/demoswork/work"
import { prepareWeb2Step, prepareXMStep } from "@/demoswork/workstep"

import { EVM } from "@/multichain/core"
import { XmStepResult } from "@/types/demoswork/steps"
import { Demos, DemosWebAuth } from "@/websdk"
import { Transaction } from "@/types"
import { ConditionalOperation } from "@/demoswork/operations/conditional"
import { BaseOperation } from "@/demoswork/operations/baseoperation"

export default async function createTestWorkScript(): Promise<Transaction> {
    const work = new DemosWork()

    const uid = getNewUID()
    const evm = await EVM.create(chainProviders.eth.sepolia)
    // The key used to sit here as a literal, in a file that shipped inside the
    // published package (only `build/tests` is excluded from `files`), so it
    // was a private key handed to every consumer. Treat that one as burned;
    // this reads whatever key the run supplies instead.
    const privateKey = process.env.DEMOS_TEST_EVM_PRIVATE_KEY
    if (!privateKey) {
        throw new Error(
            "createTestWorkScript needs DEMOS_TEST_EVM_PRIVATE_KEY (a funded Sepolia test key)",
        )
    }
    await evm.connectWallet(privateKey)
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
    const sendHash = prepareWeb2Step({
        url: "https://icanhazip.com",
        method: "GET",
    })
    sendHash.description = "Send xm hash to HTTP API"

    const operation = new ConditionalOperation()
    operation
        .if(sendEth.output.result, "==", XmStepResult.success)
        .then(sendHash)
        .elif(sendEth.output.result, "==", XmStepResult.error)
        .then(sendHash)

    const baseOperation = new BaseOperation()
    baseOperation.addWork(sendEth)

    console.log("baseOperation", baseOperation)

    work.push(baseOperation)
    const script = work.toJSON()
    console.log(script)

    // INFO: Create private key and return the signed transaction
    const identity = DemosWebAuth.getInstance()
    await identity.create()

    const demos = new Demos()
    await demos.connectWallet(
        "entire vocal party hold witness glimpse damp cat small type whale cry",
        { algorithm: "ed25519" },
    )

    return await prepareDemosWorkPayload(work, demos)
}
