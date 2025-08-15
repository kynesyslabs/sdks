import { Transaction } from "@kynesyslabs/types"
import { DemoScript } from "@kynesyslabs/types"

import { Demos, DemosTransactions } from "@kynesyslabs/websdk"
import { DemosWorkOperation } from "./operations"
import { runSanityChecks } from "./validator"

export class DemosWork {
    script: DemoScript = {
        operationOrder: new Set<string>(),
        operations: {},
        steps: {},
    }

    // INFO: Step results indexed by stepUID
    results: Record<string, any> = {}

    push(operation: DemosWorkOperation) {
        // @ts-expect-error
        // INFO: Add operation to the script
        this.script.operations[operation.operationScript.id] =
            operation.operationScript
        this.script.operationOrder.add(operation.operationScript.id)

        // INFO: Add steps used by the operation to the script
        for (const stepUID in operation.steps) {
            this.script.steps[stepUID] = operation.steps[stepUID]
        }

        // INFO: Add operations used by the operation to the script
        for (const op of operation.operations) {
            // @ts-expect-error
            this.script.operations[op.operationScript.id] = op.operationScript
        }
    }

    validate(script: DemoScript) {
        runSanityChecks(script)
    }

    fromJSON(script: DemoScript) {
        let newscript = script
        newscript.operationOrder = new Set(script.operationOrder)

        this.script = script
        return this
    }

    // async execute() {
    //     return await executeScript(this)
    // }

    toJSON() {
        let script = this.script
        // @ts-expect-error
        // convert set to array
        script.operationOrder = [...script.operationOrder]

        // remove all step outputs
        for (const stepUID in script.steps) {
            console.log("stepUID", script.steps[stepUID])
            delete script.steps[stepUID].id
        }

        // remove all operation uids
        for (const opUID in script.operations) {
            delete script.operations[opUID].id
        }

        this.validate(script)
        // return JSON.stringify(script)
        return script
    }

    // TODO: Add static methods for adding and retrieving step results
}

export async function prepareDemosWorkPayload(
    work: DemosWork,
    demos: Demos,
): Promise<Transaction> {
    const script = work.toJSON()
    let tx: Transaction = DemosTransactions.empty()
    // tx.content.from = demos.keypair.publicKey
    tx.content.to = tx.content.from
    tx.content.type = "demoswork"

    tx.content.data = ["demoswork", script]
    tx.content.timestamp = Date.now()
    tx = await demos.sign(tx)

    return tx
}
