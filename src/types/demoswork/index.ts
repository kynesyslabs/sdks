import { v4 as uuidv4 } from "uuid"

function getNewUID() {
    return uuidv4()
}

// SECTION: XM
/**
 * A xm step can either be successful or error
 */
export enum XmStepResult {
    success = "success",
    error = "error",
}

/**
 * Assume a xm step that send some ether outputs and object of this shape
 */
interface DemosXmStepOutput {
    stepUID: string
    result: XmStepResult

    /**
     * The hash of the sent transaction
     */
    hash: string
}

// SECTION: WEB2
// =============================================================================

/**
 * Assume this is how a web2 request looks like
 */
interface Web2Request {
    url: string
    method: "GET" | "POST" | "PUT" | "DELETE"
    data?: Object
}

interface DemosWeb2StepOutput {
    statusCode: number
    payload: Object
}

// SECTION: WORK STEPS

interface WorkStepInput {
    type: "xm" | "web2"
    payload: "payload" | Web2Request
}

export class WorkStep {
    type: string
    workUID: string
    input: WorkStepInput
    output: any
    description: string
    // output: DemosXmStepOutput

    constructor(input: WorkStepInput) {
        this.type = input.type
        this.input = input
        this.workUID = getNewUID()
    }

    exec() {
        // INFO: Send payload or execute web2 request here
    }
}

enum OutputTypes {
    demosType = "internal",
}

export class Web2WorkStep extends WorkStep {
    override output = {
        statusCode: {
            type: OutputTypes.demosType,
            src: {
                stepUID: this.workUID,
                key: "output.statusCode",
            },
        },
        payload: {
            type: OutputTypes.demosType,
            src: {
                stepUID: this.workUID,
                key: "output.payload",
            },
        },
    }

    constructor(payload: Web2Request) {
        super({ type: "web2", payload })
    }
}

export class XmWorkStep extends WorkStep {
    override output = {
        result: {
            type: OutputTypes.demosType,
            src: {
                stepUID: this.workUID,
                key: "output.result",
            },
        },
        hash: {
            type: OutputTypes.demosType,
            src: {
                stepUID: this.workUID,
                key: "output.hash",
            },
        },
    }

    constructor(payload: "payload") {
        super({ type: "xm", payload })
    }
}

enum stepKeysEnum {
    "output.result" = "output.result",
    "output.hash" = "output.hash",
    // others here
}

type stepKeys = keyof typeof stepKeysEnum

export function equalTo(step: WorkStep, key: stepKeys, value: any) {
    return {
        step: step,
        operator: "equality",
        key: key,
        value: value,
    }
}

/**
 * The final shape of the work script
 */
interface XmScript {
    operationOrder: Set<string>
    operations: { [key: string]: any }
    steps: { [key: string]: WorkStep }
}

/**
 * The shape of the condition
 * that is used in `DemosWork.if` and friends
 */
interface Condition {
    step: WorkStep
    operator: string
    key: string
    value: any
}

/**
 * The shape of the conditional operation
 * on the if_script
 */
interface Conditional {
    operator: string
    key: string
    value: any
    stepUID: string
}

// class XmScript {
//     operationOrder: Set<string>
//     operations: { [key: string]: any }
//     steps: { [key: string]: WorkStep }

//     constructor() {
//         this.operations = {}
//         this.operationOrder = new Set()
//         this.steps = {}
//     }
// }

export class DemosWork {
    #iscript: XmScript = {
        operationOrder: new Set<string>(),
        operations: {},
        steps: {},
    }
    results: Map<string, DemosXmStepOutput | DemosWeb2StepOutput> = new Map()
    steps: WorkStep[]

    constructor(steps: WorkStep[] = []) {
        this.steps = steps
    }

    get script() {
        let script = this.#iscript
        script.steps = this.steps.reduce((acc, step) => {
            delete step.output
            acc[step.workUID] = step
            return acc
        }, {} as { [key: string]: WorkStep })

        return script
    }

    add(step: WorkStep) {
        this.steps.push(step)
    }

    if(condition: Condition) {
        // INFO: 1. Index the work step
        this.steps.push(condition.step)

        // INFO: 2. Start building the if_script
        let if_script = {
            operationUID: getNewUID(),
            operationType: "conditional",
            condition: {
                operator: condition.operator,
                key: condition.key,
                value: condition.value,
                stepUID: condition.step.workUID, // Run this step if the condition is true
            } as Conditional,
            elifs: <Conditional[]>[], // A list of conditions
            then: <string | null>null, // A workStep.workUID
            else: <string | null>null,
        }

        const elif = (elif_condition: Condition) => {
            // INFO: 3. Index this "elif" condition
            this.steps.push(elif_condition.step)

            // INFO: 4. Extend the elifs list of the if_script
            if_script.elifs.push({
                operator: elif_condition.operator,
                key: elif_condition.key,
                value: elif_condition.value,
                stepUID: elif_condition.step.workUID,
            })

            // INFO: 5. Allow chaining of elif and then
            return { then }
        }

        const then = (step: WorkStep) => {
            // NOTE: This is the closing step of the conditional operation
            // INFO: 6. Index the closing work step
            this.steps.push(step)

            // INFO: 7. Extend the if_script with the "then" step
            if_script.then = step.workUID

            // INFO: 8. Close operation by adding the if_script to the work script
            this.#iscript.operations[if_script.operationUID] = if_script
            this.#iscript.operationOrder.add(if_script.operationUID)

            return { elif, else_ }
        }

        const else_ = (step: WorkStep) => {
            this.steps.push(step)
            if_script.else = step.workUID

            // TODO: 9. Update the work script with the final if_script containing the else step
        }

        // INFO: 10. Allow chaining of if, elif and then
        return { then }
    }

    toJSON() {
        let script = this.script
        // @ts-expect-error
        script.operationOrder = [...script.operationOrder]
        return JSON.stringify(script, null, 2)
    }
}

// class DemosWorkLoader extends DemosWork {
//     #iscript: XmScript

//     fromScript(script: XmScript) {
//         let newscript = script
//         newscript.operationOrder = new Set(script.operationOrder)

//         this.#iscript = script
//         return this
//     }
// }
// SECTION: Example usage

// const work = new DemosWork()

// const sendEth = new WorkStep({
//     type: "xm",
//     payload: "payload",
// })

// const sendHash = new WorkStep({
//     type: "web2",
//     payload: {
//         url: "https://myapi.com",
//         method: "POST",
//         data: {
//             hash: sendEth.output.hash,
//         },
//     },
// })

// //              WorkStep | Workstep property | value
// work.if(equalTo(sendEth, "output.result", XmStepResult.success))
//     .then(sendHash)
//     .elif(equalTo(sendEth, "output.result", XmStepResult.error))
//     .then(sendHash)
//     .else_(sendHash)

// // This would be the final script
// console.log(work.script)

// SECTION: NOTES

// What I've figured out:
// ✅ Creating an empty work script
// ✅ Adding steps (a multi context operation, eg. sending ether on xm)
// ✅ Creating a conditional operation
// ❌ Using output of a step in another step
