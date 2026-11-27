// These tests construct workflow references only; no SDK connection is needed.
jest.mock("@/websdk", () => ({ skeletons: {} }))
jest.mock("@/types", () => ({ ...require("@/types/demoswork/datatypes"), EnumWeb2Actions: {} }))

import { DataTypes } from "@/types/demoswork/datatypes"

const makeStep = async () => {
    const { prepareNativeStep } = await import("@/demoswork/workstep")
    return prepareNativeStep({ nativeOperation: "send", args: ["fixture", 1] })
}

test("base_output refers to the whole output of its originating step", async () => {
    const step = await makeStep()
    const ref = step.base_output
    expect(ref.type === DataTypes.work).toBe(true)
    expect(ref.src.self).toBe(step)
    expect(ref.src.key).toBe("output")
    const { Condition } = await import("@/demoswork/operations/conditional/condition")
    const condition = new Condition({ operator: "not", value_a: ref, action: null })
    expect(condition.value_a).toEqual({ type: DataTypes.internal, workUID: step.id, key: "output" })
    expect(condition.work.get(step.id)).toBe(step)
})

test("named and dotted output references retain their field paths", async () => {
    const step = await makeStep()
    for (const field of ["result", "quote.price", "type", "src"]) {
        const ref = step.output[field]
        expect(ref.type).toBe(DataTypes.work)
        expect(ref.src.self).toBe(step)
        expect(ref.src.key).toBe(`output.${field}`)
    }
})
