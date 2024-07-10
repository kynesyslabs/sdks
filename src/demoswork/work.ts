import { DemoScript } from "@/types/demoswork"
import { Condition } from "@/types/demoswork/steps"
import pprint from "@/utils/pprint"
import executeScript from "./executor"
import { Conditional } from "./operations/conditional"
import sanityCheck from "./validator"

export class DemosWork {
    script: DemoScript = {
        operationOrder: new Set<string>(),
        operations: {},
        steps: {},
    }
    // INFO: Step results indexed by stepUID
    results: Record<string, any> = {}

    if(condition: boolean | Condition) {
        return new Conditional(this.script, condition)
    }

    validate(script: DemoScript) {
        sanityCheck(script)
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
}
