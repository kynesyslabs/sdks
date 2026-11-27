// Keep the transaction SDK out of this in-memory builder test.
jest.mock("@/websdk", () => ({ DemosTransactions: {}, skeletons: {} }))
jest.mock("@/types", () => ({ ...require("@/types/demoswork/datatypes"), EnumWeb2Actions: {} }))

test("serializing a DemosWork leaves it editable and keeps earlier snapshots stable on push", async () => {
    const { BaseOperation } = await import("@/demoswork/operations/baseoperation")
    const { DemosWork } = await import("@/demoswork/work")
    const { prepareNativeStep } = await import("@/demoswork/workstep")
    const work = new DemosWork()
    const step = prepareNativeStep({ nativeOperation: "send", args: ["fixture", 1] })
    const stepId = step.id
    const a = new BaseOperation(step)
    const b = new BaseOperation()

    work.push(a)
    const first = work.toJSON()
    work.push(b)
    const second = work.toJSON()

    expect(first.operationOrder).toEqual([a.id])
    expect(Object.keys(first.operations)).toEqual([a.id])
    expect(second.operationOrder).toEqual([a.id, b.id])
    expect(Object.keys(second.operations)).toEqual([a.id, b.id])
    expect(first.operations[a.id]).toMatchObject({ operationType: "base", order: [stepId] })
    expect(first.steps[stepId]).toMatchObject({ context: "native", content: step.content })
    expect(first.operations[a.id]).not.toHaveProperty("id")
    expect(first.steps[stepId]).not.toHaveProperty("id")
    expect(step.id).toBe(stepId)
    expect(a.operationScript.id).toBe(a.id)
    expect(b.operationScript.id).toBe(b.id)
})
