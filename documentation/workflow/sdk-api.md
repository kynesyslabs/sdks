# Demos Workflow SDK API Usage

Start by creating a DemoScript builder instance.

```ts
import { DemosWork } from "@kynesyslabs/demosdk-beta/demoswork"

const work = new DemosWork()
```

> [!TIP]
> All imports used here come from `@kynesyslabs/demosdk-beta/demoswork`

## Steps

A step can be likened to a single statements in programming. There are 3 types of steps:

1. Multichain step
2. Web2 step
3. Native step

You can create each of these types using the prepare methods provided by the module:

```ts
const xmStep = prepareXmStep( ... ) // pass an XmScript
const web2Step = prepareWeb2Step(
     "POST",
    "https://icanhazip.com",
    null,
    null,
    null,
    2,
) // Same params as prepareWeb2Payload in demos.ts

const nativeStep = prepareNativeStep( ... ) // pass the native payload
```

## Operations

An operation can be likened to a function in programming.

### Base Operation

This operation enables you to simply group steps or operations together in an ordered manner.

```ts
const operation = BaseOperation()
operation.addWork(xmStep, web2Step, someOperation, ...)

// OR

const operation = BaseOperation(xmStep, web2Step, someOperation, ...)
```

### Conditional operation

You can create a conditional operation either by passing conditions to the `ConditionalOperation` class.

```ts
const condition = new Condition({
    operand: true,
    operator: "==",
    data: sendEth.output.result,
    action: sendHash,
})

const operation = new ConditionalOperation(condition, otherCondition, ...)
```

You can also the builder methods:

```ts
// 1. create a builder class
const operation = new ConditionalOperation()

// 2. construct operation
operation.if(xmStep.output.result, "==", "success").then(web2Step)
```

You can also use another operation in the conditional operation:

```ts
const operation2 = new ConditionalOperation()
operation2.if(xmStep.output.result, "==", "error").then(otherOperation)

// OR

operation2.if(operation.output.result, "==", "error").then(otherOperation)
```

You can also reference values across steps and operations:

```ts
operation2
    .if(operation.output.result, "==", xmStep.output.result)
    .then(otherOperation)
```

> [!TIP]
> To create an `else` clause using the `Condition` class, create an equality condition whose data and operator are null (or something that evaluates to true).

### Write the operation to the script

```ts
work.push(operation2)
```

Pushing an operation will add it to the `operationOrder`. Operations used by the pushed one don't need to be pushed as they are copied into the script automatically.

The pushed operation(s) will drive the execution of the script.

### Export to JSON

```ts
work.toJSON()
```

> [!NOTE]
> `toJSON()` won't export the script to a stringified JSON string, but rather a JSON-serializable `DemoScript` object. The method just removes circular references from the steps and operations and return a clean script.
