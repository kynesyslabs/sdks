# Demos Workflow SDK API Usage

Start by creating a DemoScript builder instance.

```ts
const work = new DemosWork()
```

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

### Conditional operation

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
