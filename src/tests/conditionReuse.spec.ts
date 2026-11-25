// Construct workflow objects in memory without loading transport modules.
jest.mock("@/websdk", () => ({ skeletons: {} }))
jest.mock("@/types", () => require("@/types/demoswork/datatypes"))

import { Condition, ConditionalOperation, NativeWorkStep } from "@/demoswork"
import { DataTypes } from "@/types/demoswork/datatypes"

function fixture() {
    const step = () => new NativeWorkStep({ nativeOperation: "send", args: ["fixture", 1] })
    const source = step()
    const action = step()
    const condition = new Condition({ operator: "not", value_a: source.output.ready, action })
    return { source, action, condition }
}

test("constructing an operation indexes the operand and action", () => {
    const { source, action, condition } = fixture()
    const operation = new ConditionalOperation(condition)
    expect(operation.steps[source.id]).toBe(source)
    expect(operation.steps[action.id]).toBe(action)
    expect(operation.operationScript.conditions.get(condition.id)).toEqual({
        operator: "not",
        value_a: { type: DataTypes.internal, workUID: source.id, key: "output.ready" },
        value_b: null,
        work: action.id,
    })
})

test("two operations can be built from the same condition", () => {
    const { source, action, condition } = fixture()
    const first = new ConditionalOperation(condition)
    const second = new ConditionalOperation(condition)
    for (const operation of [first, second]) {
        expect(operation.operationScript.order).toEqual([condition.id])
        expect(operation.steps[source.id]).toBe(source)
        expect(operation.steps[action.id]).toBe(action)
    }
    expect(condition.work.get(source.id)).toBe(source)
})
