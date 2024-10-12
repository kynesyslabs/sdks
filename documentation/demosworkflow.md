# Demos Work

DemosWork is a module that helps you create a script (DemosScript) that can be executed on the omniweb.

A DemosScript is made up of these components:

1. Work steps - A step is a single action that can be executed on the omniweb.
2. Operations - An operation is a group of steps or a conditional.
3. The operation order - This is an ordered list of operation UIDs. It dictates the order in which the operations in a script are supposed to be executed.

DemosWork is implemented as a class that looks like this:

_@/demoswork/work.ts_

```ts
class DemosWork {
    script: DemoScript = {
        steps: {},
        operations: {},
        operationOrder: new Set<string>(),
    }

    push(operation: DemosWorkOperation)
    toJSON()
}
```

The `push` method adds an operation to the DemoScript.

## Work steps
A work step is a single action that can be executed on the omniweb. It can either be a web2, xm or a native transaction. Say for example, sending tokens on Ethereum or calling a web2 API.

A work step is implemented as follows:

```ts
class WorkStep {
    id: string = "step_" + UID
    context: "xm" | "web2" | "native"
    content: WorkStepInput // payload specific to the context
    output: {
        [key: string]: StepOutputKey
    }
    description: string
    timestamp: number = Date.now()
}
```

The `output` of a workstep indicated above is not the result of executing the step. Since we don't have that value yet, the output is represented as objects that operations can use to refer to the future/actual output of the step.

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

> The various workstep classes extend the base `WorkStep` class and customize the `content` and `output` fields.

## Operations

An operation controls the execution of steps therefore enabling scripting on the omniweb. An operation can be a group of steps or a conditional.

An operation is implemented as follows:

```ts
abstract class DemosWorkOperation {
    id: string = "op_" + UID
    abstract type: string

    steps: Record<string, WorkStep> = {}
    operations: Set<DemosWorkOperation> = new Set()
    output: any // specific to the operation type

    operationScript: OperationScript

    addWork(work: WorkStep | DemosWorkOperation): void
}
```

The operation class indexes the steps and operations it contains in the `steps` and `operations` fields. The `operationScript` field is specific to the operation type and is copied into the main script when the operation is added to the work instance.

> The `addWork` method is used to add steps and operations to the operation (where applicable). If the work passed is an operation, its steps and operations are copied into the current operation.

## Conditional Operation

A conditional operation now builds on top of that:

_@/demoswork/operations/conditional/index.ts_

```ts
class Condition {
    id: string
    action: WorkStep | DemosWorkOperation = null
    value_a: Condition | Operand = null
    value_b: Condition | Operand = null
    work: Map<string, WorkStep | DemosWorkOperation> = new Map()
}

class ConditionalOperation extends DemosWorkOperation {
    type = "conditional"
    override operationScript: ConditionalOperationScript = {
        id: this.id,
        operationType: "conditional",
        conditions: new Map(),
        order: [],
    }

    constructor(...conditions: Condition[]): void

    if(value_a, operator, value_b)
    then(step: WorkStep | DemosWorkOperation)
    else(step: WorkStep | DemosWorkOperation)
}
```

A conditional operation is created by passing in conditions to the constructor. The `if`, `then` and `else` methods are helpers that can be used to build a conditional operation by chaining them together.

## Base Operation

The base operation groups steps and operations together without any additional logic.

The base operation is implemented as follows:

_@/demoswork/operations/baseoperation.ts_

```ts
class BaseOperation extends DemosWorkOperation {
    type = "base"
    operationScript: BaseOperationScript = {
        id: this.id,
        operationType: "base",
        order: [],
    }

    constructor(...work: Array<WorkStep | DemosWorkOperation>)
    override addWork(...work: Array<WorkStep | DemosWorkOperation>): void
}
```

Work can be added to the base operation by passing in the work to the constructor or using the `addWork` method.

### The Operation Order

This is an ordered list of Operation UID strings. It dictates the order in which the operations in a script are supposed to be executed.

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
