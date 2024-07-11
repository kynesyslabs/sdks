import { XmStepResult } from "@/types/demoswork/steps"
import { equalTo } from "@/demoswork/utils"
import { DemosWork } from "@/demoswork/work"
import { Web2WorkStep, XmWorkStep } from "@/demoswork/workstep"

import pprint from "@/utils/pprint"
import createTestScript from "@/demoswork/utils/createTestWorkScript"

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

        const sendMoreEth = new XmWorkStep("payload" as any)
        sendMoreEth.description = "Send more ETH"

        const sendHash = new Web2WorkStep({
            url: "https://myapi.com",
            method: "POST",
            data: {
                hash: sendEth.output.hash,
            },
        } as any)
        sendHash.description = "Send xm hash to HTTP API"

        //              WorkStep | Workstep property | value
        work.if(sendEth.output.result, "==", XmStepResult.success)
            .then(sendHash)
            .elif(sendEth.output.result, "==", XmStepResult.error)
            .then(sendHash)
            .else(sendHash)

        // work.if(sendEth.output.result, "==", XmStepResult.error)
        // This would be the final script
        pprint(work.toJSON())

        const loaded = work.fromJSON(work.toJSON())

        const res = await loaded.execute()
        pprint(res)
        pprint(loaded.results)
    })
})
