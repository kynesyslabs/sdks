import {
    DemosWork,
    Web2WorkStep,
    XmStepResult,
    XmWorkStep,
    equalTo
} from "@/types/demoswork"
import pprint from "@/utils/pprint"

describe("Demos Workflow", () => {
    it("works", () => {
        const work = new DemosWork()

        const sendEth = new XmWorkStep("payload")
        sendEth.description = "Send ETH"

        const sendMoreEth = new XmWorkStep("payload")
        sendMoreEth.description = "Send more ETH"

        const sendHash = new Web2WorkStep({
            url: "https://myapi.com",
            method: "POST",
            data: {
                something: "else",
                hash: sendEth.output.hash,
            },
        })

        //              WorkStep | Workstep property | value
        work.if(equalTo(sendEth, "output.result", XmStepResult.success))
            .then(sendHash)
            .elif(equalTo(sendMoreEth, "output.result", XmStepResult.error))
            .then(sendHash)
            .else_(sendHash)

        // This would be the final script
        pprint(work.script)
    })
})
