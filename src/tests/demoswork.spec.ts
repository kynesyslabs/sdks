import { DemosWork, prepareDemosWorkPayload } from "@/demoswork/work"
import { Web2WorkStep, XmWorkStep } from "@/demoswork/workstep"
import { XmStepResult } from "@/types/demoswork/steps"

import {
    BaseOperation,
    Condition,
    ConditionalOperation,
    prepareWeb2Step,
} from "@/demoswork"
import createTestScript from "@/demoswork/utils/createTestWorkScript"
import pprint from "@/utils/pprint"
import { DemosWebAuth } from "@/websdk"

describe("Demos Workflow", () => {
    test("Creating a demoswork tx", async () => {
        const tx = await createTestScript()
        pprint(tx)
    })

    test.only("It works", async () => {
        const work = new DemosWork()

        const action = prepareWeb2Step("GET", "https://google.com")
        const action2 = prepareWeb2Step("GET", "https://youtube.com")
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

        const fallbackActionMain = prepareWeb2Step(
            "GET",
            "https://icanhazip.com",
        )
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
