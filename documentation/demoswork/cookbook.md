# DemosWork Cookbook

# Creating a web2 workstep

You can create a web2 workstep to performa a `GET` request to `https://icanhazip.com` using the `prepareWeb2Step` function.

```ts
import { prepareWeb2Step } from "@kimcalc/demosdk/demoswork"

const getIP = prepareWeb2Step({
    action: "GET",
    url: "https://icanhazip.com",
})
```

## Creating a XM workstep

THe process of creating a cross chain workstep to send some ETH to an address can be described as follows:

1. Generating a payload to send ETH
2. Create a `XMScript` with the payload
3. Create an XM step with the `XMScript`

```ts
import { XMScript } from "@kimcalc/demosdk/types"
import { EVM } from "@kimcalc/demosdk/multichain/websdk"
import { prepareXMStep } from "@kimcalc/demosdk/demoswork"
import { prepareXMScript } from "@kimcalc/demosdk/websdk/XMTransactions"

// 1. Getting EVM payload
const evm_rpc = "https://rpc.ankr.com/eth_sepolia"
const evm_key = process.env.EVM_KEY

const evm = await EVM.create(evm_rpc)
await evm.connectWallet(evm_key)

const payload = await evm.prepareTransfer(
    "0x8A6575025DE23CB2DcB0fE679E588da9fE62f3B6",
    "0.25",
)

// 2. Creating a XMScript
const xmscript = prepareXMScript({
    chain: "eth",
    subchain: "sepolia",
    type: "pay",
    signedPayloads: [payload],
})

// 3. Creating a XM step
const sendEth = prepareXMStep(xmscript)
```

# Creating Operations

## Conditional Operation

There are two ways to go about creating a conditional operation.

1. Using the `if`, `then` and `else` methods of the `ConditionalOperation` class.
2. Creating `Condition` objects and passing them to the constructor of the `ConditionalOperation` class.

### 1. Using the `if`, `then` and `else` methods

```ts
import { EVM } from "@kimcalc/demosdk/multichain/websdk"
import { prepareXMScript } from "@kimcalc/demosdk/websdk/XMTransactions"
import {
    DemosWork,
    prepareWeb2Step,
    prepareXMStep,
    ConditionalOperation,
} from "@kimcalc/demosdk/demoswork"

const address = "0x8A6575025DE23CB2DcB0fE679E588da9fE62f3B6"
const isMember = prepareWeb2Step({
    url: `https://api.[redacted].com/v1/eth_sepolia/address/${address}`,
    method: "GET",
})

// Web2 step to do a POST API call
const addMember = prepareWeb2Step({
    url: `https://api.[redacted].com/v1/eth_sepolia/address/${address}?key=ckey_5a044cf0034a43089e6b308b023`,
    method: "POST",
})

// XM step to send ETH
const evm = await EVM.create("https://rpc.ankr.com/eth_sepolia")
await evm.connectWallet(process.env.EVM_KEY)
const payload = await evm.prepareTransfer(address, "0.25")

const xmscript = prepareXMScript({
    chain: "eth",
    subchain: "sepolia",
    type: "pay",
    signedPayloads: [payload],
})
const releaseFunds = prepareXMStep(xmscript)

// Conditional operation

const operation = new ConditionalOperation()
operation
    .if(isMember.output.statusCode, "==", 200)
    .then(releaseFunds)
    .else(addMember)

// Creating a DemosWork object and indexing the operation
const work = new DemosWork()
work.push(operation)
```

### Using the `Condition` class

The `Condition` class can be used to construct a conditional operation without using the `if`, `then` and `else` methods.

`Condition` objects can be reused and combined to create more complex conditional operations.

A condition looks is implemented as follows:

```ts
import { operators } from "@kimcalc/demosdk/types"

class Condition {
    value_a: any
    operator: operators
    value_b: any
    action: WorkStep | DemosWorkOperation
}
```

The `value_a` and `value_b` fields are the operands of the condition. The `operator` field determines the type of condition. The `action` field is the work step or operation that will be executed if the condition is met.

The `value_a` and `value_b` fields can accept any of the following:

1. A work step or operation output
2. Another condition
3. A static value

You can create the same conditional operation as the previous example using the `Condition` class as follows:

```ts
import { EVM } from "@kimcalc/demosdk/multichain/websdk"
import { prepareXMScript } from "@kimcalc/demosdk/websdk/XMTransactions"
import {
    Condition,
    DemosWork,
    prepareWeb2Step,
    prepareXMStep,
    ConditionalOperation,
} from "@kimcalc/demosdk/demoswork"

const address = "0x8A6575025DE23CB2DcB0fE679E588da9fE62f3B6"
const isMember = prepareWeb2Step({
    url: `https://api.[redacted].com/v1/eth_sepolia/address/${address}`,
    method: "GET",
})

// Web2 step to do a POST API call
const addMember = prepareWeb2Step({
    url: `https://api.[redacted].com/v1/eth_sepolia/address/${address}?key=ckey_5a044cf0034a43089e6b308b023`,
    method: "POST",
})

// XM step to send ETH
const evm = await EVM.create("https://rpc.ankr.com/eth_sepolia")
await evm.connectWallet(process.env.EVM_KEY)
const payload = await evm.prepareTransfer(address, "0.25")

const xmscript = prepareXMScript({
    chain: "eth",
    subchain: "sepolia",
    type: "pay",
    signedPayloads: [payload],
})
const releaseFunds = prepareXMStep(xmscript)

// Condition to check if the user is a member
const checkIsMember = new Condition({
    value_a: isMember.output.statusCode,
    operator: "==",
    value_b: 200,
    action: releaseFunds,
})

// Fallback condition (else)
const notMember = new Condition({
    value_a: null,
    operator: null,
    value_b: null,
    action: addMember,
})

// Creating a conditional operation
const operation = new ConditionalOperation(checkIsMember, notMember)

// Creating a DemosWork object and indexing the operation
const work = new DemosWork()
work.push(operation)
```

## Demoswork to Transaction

To convert a Demoswork object to a transaction, use the `prepareDemosWorkPayload` function.

```ts
import { DemosWebAuth } from "@kimcalc/demosdk/websdk"
import { prepareDemosWorkPayload } from "@kimcalc/demosdk/demoswork"

// ...

// Generating a keypair
const identity = DemosWebAuth.getInstance()
await identity.create()

// Creating a transaction
const tx = await prepareDemosWorkPayload(work, identity.keypair)
```

## Broadcasting the transaction

You can broadcast the transaction using the `confirm` and `broadcast` methods of the `demos` object.

```ts
import { demos } from "@kimcalc/demosdk/websdk"

// ...

// Connecting to the DEMOS network
const rpc_url = "https://demosnode.discus.sh"

await demos.connect(rpc_url)
await demos.connectWallet(identity.keypair.privateKey)

// Confirming the transaction
const validityData = await demos.confirm(tx)

// Broadcasting the transaction
const res = await demos.broadcast(validityData)
console.log("res:", res)
```

## Combining conditions

```ts
// equality
const booleanCondition = new Condition({
    value_a: true,
    operator: "==",
    value_b: true,
    action: null,
})

// greater than
const greaterThanCondition = new Condition({
    value_a: 10,
    operator: ">",
    value_b: 5,
    action: null,
})

// and
const combinedCondition = new Condition({
    value_a: booleanCondition,
    operator: "&&",
    value_b: greaterThanCondition,
    action: null,
})

// not
const notCondition = new Condition({
    value_a: booleanCondition,
    operator: "not",
    value_b: null,
    action: null,
})
```

## Base Operation

The base operation allow you to group work steps and operations for execution without any additional logic.

```ts
import { BaseOperation, prepareXMStep } from "@kimcalc/demosdk/demoswork"

const base = new BaseOperation()
const sendEth = prepareXMStep({
    // XMScript here
})

const sendSol = prepareXMStep({
    // XMScript here
})

base.addWork(sendEth, sendSol)

const work = new DemosWork()
work.push(base)
```

Work steps are created and added to the base operation using the `addWork` method.

You can also pass the work steps and operations to the constructor of the `BaseOperation` class.

```ts
const base = new BaseOperation(checkBTCPrice, checkEthPrice)
```

> [!NOTE]
> You can also use operations (eg. conditional operation) and work steps with the `BaseOperation` class.
