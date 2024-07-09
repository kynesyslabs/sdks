# Demos Work

A Demos Work Script (DemoScript) is made up of these components:

1. Work steps
2. Operations
3. The operation order

### Work steps

A work step can either be a web2, xm or a native transaction. Say for example, sending tokens on Ethereum or calling a web2 API.

A work step generally looks like this:

```ts
class WorkStep {
    type: "xm" | "web2" | "native"
    workUID: string
    input: WorkStepInput // tx
    output: any
    description: string

    hash: string
    signature: Uint8Array

    sign(privateKey: any): Uint8Array
    execute(): WorkStepOutput // for the node
}
```

The output of a workstep indicated above is not the result of executing the step. Since we don't have that value yet, the output is represented as objects that operations can use to refer to the future/actual output of the step.

For instance, here's how the web2 step output is defined:

_@/demoswork/workstep.ts_

```ts
class Web2WorkStep extends WorkStep {
    output: any = {
        statusCode: {
            type: "internal",
            src: {
                stepUID: this.workUID,
                key: "output.statusCode",
            },
        },
        payload: {
            type: "internal",
            src: {
                stepUID: this.workUID,
                key: "output.payload",
            },
        },
    }
}
```

When executing an operation that needs an output of a step, that step will be executed and its result parsed using the key specified to get the value.

### Operations

An operation controls the execution of steps therefore enabling scripting on the omniweb.

An operation can be a group of steps, a conditional, a loop or something else. I used the conditional operation to set up the ground work.

An operation generally looks like this:

```ts
class Operation {
    operationUID: string
    operationType: "conditional" | "loop" | ...
}
```

A conditional operation now builds on top of that:

_@/demoswork/operations/conditional.ts_

```ts
interface Condition {
    operator: string
    key: string
    value: any
    stepUID: string
    do: string
}

class Conditional extends Operation {
    conditions: Condition[]

    then(step: WorkStep) {
        return {
            elif: this.elif,
            else: this.else,
        }
    }

    elif(condition: ConditionWithStep) {
        return {
            then: this.then,
        }
    }

    else(): void
}
```

After constructing an operation, it collects the referred steps and writes itself to the DemoScript.

### The Operation Order

This is an ordered list of Operation UID strings. It dictates the order in which the operations in a script are supposed to be executed.

### The DemosWork class

The `DemosWork` class is the starting point of creating a DemoScript. It exposes methods to construct a DemoScript, add operations and steps.

It currently looks like this:

```ts
class DemosWork {
    script: DemoScript = {
        steps: {},
        operations: {},
        operationOrder: new Set<string>(),
    }

    if(condition: Condition) {
        return new Conditional(this.script, condition)
    }

    // more operation go here

    validate(): boolean | any
    execute(): Promise<any> // for the node

    toJSON(): JSON<DemoScript> {}
}
```

You can find the implementations of the above in the `@/demoswork` directory in the `demoswork` branch.

### Example usage

You can create a DemoScript with a conditional operation using the following code:

```ts
const work = new DemosWork()

// INFO: Create work steps
const sendEth = new XmWorkStep("payload")
sendEth.description = "Send ETH"

const sendMoreEth = new XmWorkStep("payload")
sendMoreEth.description = "Send more ETH"

const sendHash = new Web2WorkStep({
    url: "https://myapi.com",
    method: "POST",
    data: {
        hash: sendEth.output.hash,
    },
})
sendHash.description = "Send xm hash to HTTP API"

// INFO: Construct a conditional operation
work.if(sendEth.output.result, "==", "success") // also accepts boolean
    .then(sendHash)
    .elif(sendEth.output.result, "==", "error") // another condition
    .then(sendHash)
    .else(sendMoreEth)

// This will validate the script and return a JSON serializable object
const demoscript = work.toJSON()
pprint(demoScript)
```

We will have methods to create steps (like the current `prepareWeb2Payload` we have on `demos.ts`) so you might not have to use the various step classes like shown above.

### Execution

When a work script is sent to the node as JSON, it will be loaded into a work instance and executed.

```ts
const work = DemosWork.fromJSON(demoScript)
const result = await work.execute()
```

The `execute` method will call the `execute` method of the underlying operations and steps writing their outputs to that work instance state. These output can then be used as other steps/operations inputs or for evaluating conditions.
