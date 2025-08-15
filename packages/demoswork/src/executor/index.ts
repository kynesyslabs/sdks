import { DemosWork } from "../work"
import { OperationScript } from "../types"

export default async function (work: DemosWork) {
    // TODO! Rewrite forEach to for...of
    for (const operationUID of work.script.operationOrder) {
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
                break

            default:
                throw new Error(
                    "Unknown operation type" + operation.operationType,
                )
        }
    }

    return work.results
}
