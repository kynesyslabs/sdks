import { DemosWork } from "@/demoswork/work"
import { Web2WorkStep, XmWorkStep } from "@/demoswork/workstep"
import { XmStepResult } from "@/types/demoswork/steps"

import { BaseOperation, Condition, ConditionalOperation } from "@/demoswork"
import createTestScript from "@/demoswork/utils/createTestWorkScript"
import pprint from "@/utils/pprint"

describe("Demos Workflow", () => {
    test.only("Creating a demoswork tx", async () => {
        const tx = await createTestScript()
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
