import { WorkStep } from "./workstep"

class XmScript {
    operationOrder: Set<string>
    operations: { [key: string]: any }
    steps: { [key: string]: WorkStep }

    constructor() {
        this.operations = {}
        this.operationOrder = new Set()
        this.steps = {}
    }
}
