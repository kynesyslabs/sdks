import { Transaction } from "@/types"
import { DemoScript } from "@/types/demoswork"

import { DemosTransactions } from "@/websdk"
import executeScript from "./executor"
import { DemosWorkOperation } from "./operations"
import { runSanityChecks } from "./validator"
import { IKeyPair } from "@/websdk/types/KeyPair"

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

    async execute() {
        return await executeScript(this)
    }

    toJSON() {
        let script = this.script
        // @ts-expect-error
        // convert set to array
        script.operationOrder = [...script.operationOrder]

        // remove all step outputs
        for (const stepUID in script.steps) {
            delete script.steps[stepUID].output
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
    work: DemosWork, keypair: IKeyPair
): Promise<Transaction> {
    const script = work.toJSON()
    let tx: Transaction = DemosTransactions.empty()
    tx.content.from = keypair.publicKey as Uint8Array
    tx.content.to = tx.content.from
    tx.content.type = "demoswork"

    tx.content.data = ["demoswork", script]
    tx.content.timestamp = Date.now()
    tx = await DemosTransactions.sign(tx, keypair)

    return tx
}
