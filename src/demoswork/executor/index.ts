import { DemosWork } from "../work"
import {
    ConditionalScript,
    OperationScript,
} from "@/types/demoswork/operations"
import executeConditional from "./conditionalExecutor"

export default async function (work: DemosWork) {
    // TODO! Rewrite forEach to for...of
    work.script.operationOrder.forEach(async operationUID => {
        const operation: OperationScript = work.script.operations[operationUID]

        if (!operation) {
            throw new Error(
                `Operation with UID ${operationUID} not found in the XMScript`,
            )
        }

        switch (operation.operationType) {
            case "conditional":
                console.log(
                    "Executing conditional operation with UID:",
                    operationUID,
                )
                await executeConditional(work, operation as ConditionalScript)
                break

            default:
                throw new Error(
                    "Unknown operation type" + operation.operationType,
                )
        }
    })
}
