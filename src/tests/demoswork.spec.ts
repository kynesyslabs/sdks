import { XmStepResult } from "@/types/demoswork/steps"
import { DemosWork } from "@/demoswork/work"
import { Web2WorkStep, XmWorkStep } from "@/demoswork/workstep"

import pprint from "@/utils/pprint"
import createTestScript from "@/demoswork/utils/createTestWorkScript"
import { ConditionalOperation } from "@/demoswork"
import { BaseOperation } from "@/demoswork/operations/baseoperation"

describe("Demos Workflow", () => {
    test.only("Creating a demoswork tx", async () => {
        const tx = await createTestScript()
        pprint(tx)
    })

    it("works", async () => {
        const work = new DemosWork()

        const sendEth = new XmWorkStep("payload" as any)
        sendEth.description = "Send ETH"
        // sendEth.sign("privateKey")

        // const sendMoreEth = new XmWorkStep("payload" as any)
        // sendMoreEth.description = "Send more ETH"

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

        const op2 = new ConditionalOperation()
        op2.if(op1.output.success, "==", sendEth.output.hash).then(sendHash)

        const baseOp = new BaseOperation()
        baseOp.add(op2)
        pprint(baseOp)

        work.push(baseOp)

        pprint(work)
        pprint(work.toJSON())
        // const loaded = work.fromJSON(work.toJSON())

        // const res = await loaded.execute()
        // pprint(res)
        // pprint(loaded.results)
    })
})
