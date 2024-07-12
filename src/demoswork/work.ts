import { Transaction } from "@/types"
import { DemoScript } from "@/types/demoswork"
import { StepOutputKey } from "@/types/demoswork/steps"
import { operators } from "@/types/demoswork/datatypes"
import pprint from "@/utils/pprint"
import { DemosTransactions, DemosWebAuth } from "@/websdk"
import executeScript from "./executor"
import { ConditionalOperation } from "./operations/conditional"
import { runSanityChecks } from "./validator"

export class DemosWork {
    script: DemoScript = {
        operationOrder: new Set<string>(),
        operations: {},
        steps: {},
    }

    // INFO: Step results indexed by stepUID
    results: Record<string, any> = {}

    // INFO: Parameters of the if statement can be either a single
    //  boolean (pre-computed value) or args that form an expression
    if(conditon: boolean): ConditionalOperation
    if(
        condition: boolean | StepOutputKey,
        operator?: operators,
        value?: any,
    ): ConditionalOperation
    if(condition: boolean | StepOutputKey, operator?: operators, value?: any) {
        if (typeof condition === "boolean") {
            return new ConditionalOperation(this.script, condition)
        }

        return new ConditionalOperation(this.script, {
            key: condition.src.key,
            operator: operator,
            step: condition.src.step,
            value: value,
        })
    }

    validate(script: DemoScript) {
        runSanityChecks(script)
    }

    fromJSON(script: DemoScript) {
        let newscript = script
        pprint(newscript.operationOrder)
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
            delete script.steps[stepUID].workUID
        }

        // remove all operation uids
        for (const opUID in script.operations) {
            delete script.operations[opUID].operationUID
        }

        this.validate(script)
        return script
    }

    // TODO: Add static methods for adding and retrieving step results
}

export async function prepareDemosWorkPayload(work: DemosWork): Promise<Transaction> {
    const script = work.toJSON()

    let tx: Transaction = DemosTransactions.empty()
    tx.content.from = DemosWebAuth.getInstance()!.keypair
        .publicKey as Uint8Array
    tx.content.to = tx.content.from
    tx.content.type = "demosWork"

    // @ts-expect-error
    tx.content.data = ["demosWork", script]
    tx.content.timestamp = Date.now()
    tx = await DemosTransactions.sign(tx)

    return tx
}
