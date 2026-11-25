import { DemosWork } from "../demoswork/work"

// The builder import does not need the transaction SDK or its dependencies.
jest.mock("@/websdk", () => ({}))
jest.mock("@/types", () => ({}))

function savedScript() {
    const base = (id: string) => ({
        id,
        operationType: "base" as const,
        critical: false,
        depends_on: [],
        order: [],
    })
    return {
        operationOrder: ["op_second", "op_first"],
        operations: { op_first: base("op_first"), op_second: base("op_second") },
        steps: {},
    }
}

describe("DemosWork.fromJSON", () => {
    it("loads the saved order without changing the caller's JSON", () => {
        const saved = savedScript()
        const before = JSON.stringify(saved)
        const work = new DemosWork().fromJSON(saved)

        expect(work.script.operationOrder).toBeInstanceOf(Set)
        expect([...work.script.operationOrder]).toEqual(["op_second", "op_first"])
        expect(JSON.stringify(saved)).toBe(before)
    })

    it("loads a frozen saved script", () => {
        const saved = Object.freeze(savedScript())
        const work = new DemosWork().fromJSON(saved)
        expect([...work.script.operationOrder]).toEqual(saved.operationOrder)
    })

    it("still accepts a Set without reusing the caller's order", () => {
        const saved = savedScript()
        const order = new Set(saved.operationOrder)
        const work = new DemosWork().fromJSON({ ...saved, operationOrder: order })
        expect([...work.script.operationOrder]).toEqual(saved.operationOrder)
        expect(work.script.operationOrder).not.toBe(order)
    })
})
