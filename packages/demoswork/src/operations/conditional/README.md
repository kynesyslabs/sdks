# How the Conditional Operational Class Works

The conditional class takes on the following shape:

```ts
interface ConditionalOperationScript {
    ...
    conditions: Map<string, Conditional>
    order: string[]
}

class ConditionalOperation {
    tempCondition: Condition
    operationScript: ConditionalOperationScript

    constructor(...conditions: Condition[])
    indexCondition(condition: Condition): {
        type: DataTypes.internal
        workUID: string
        key: string
    }
    parseConditionValue(value: Operand | Condition): Operand
    appendCondition(condition: Condition): number

    // ignore value type here
    if(value_a: any, operator: operators, value_b?: any): any
    then(step: WorkStep | DemosWorkOperation): any
    else(step: WorkStep | DemosWorkOperation): number
}
```

## Usage

You can use the class in any of the following ways:

1. By passing fully formed conditions via the constructor using the spread operator.
2. Using the `if`, `then` and `else` methods provided.

## Using the constructor

When using the first method, you use the `Condition` class defined at `./condition.ts`. It looks something like this:

```ts
class Condition {
    id: string
    action: WorkStep | DemosWorkOperation
    value_a: Condition | Operand
    value_b: Condition | Operand
    operator: operators
    work: Map<string, WorkStep | DemosWorkOperation>

    // implementation abstracted (check out the implementation in the file)
}
```

You create conditions by passing values, and the operator to the constructor of the `Condition` class.

Once created, these instances can be used in the conditional operation. These instances are passed to the `appendOperation` method which indexes the work units involved and write the condition to the operation script.

## Using methods

When you use the `if` method, a condition instance is created and assigned to `tempCondition`. When you update the condition using the `then` method, the `tempCondition` is finalized and routed to `appendCondition`.

## The appendCondition method

The `appendCondition` method copies work units defined in the conditions to the operation script. It also creates entries in the script using the `indexCondition` method, which calls the `parseConditionValue` method to format condition values.

When conditions reference each other, these methods call each other recursively until all conditions are indexed. Conditions are indexed as a map object with an `order` property controlling the order of execution.

Here is how an equality check driven by a logical not operation looks like on the operation script:

```ts
"op_5784ee70135c49ac84ac53a08bb2c932": {
    operationType: 'conditional',
    conditions: {
        'cond_61b6f6e574114a1da175ae0b4a768749': {
            operator: '==',
            value_a: { type: '$static', value: 'success' },
            value_b: { type: '$static', value: 'success' }
        },
        'cond_5901af81d8f146d3bef8b2bba66015fa': {
            operator: 'not',
            value_a: {
                type: '$internal',
                workUID: 'cond_61b6f6e574114a1da175ae0b4a768749',
            },
            work: 'step_e36120a2b7a64f5a8497e84e9ed30502'
        }
    },
    order: [ 'cond_5901af81d8f146d3bef8b2bba66015fa' ]
}
```
