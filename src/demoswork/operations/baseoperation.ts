import { WorkStep } from ".."
import { DemosWorkOperation } from "."
import {
    BaseOperationScript,
    OperationType,
} from "@/types/demoswork/operations"

export class BaseOperation extends DemosWorkOperation {
    override type: OperationType = "base"
    override operationScript: BaseOperationScript = {
        id: this.id,
        operationType: "base",
        order: [],
        critical: false,
        depends_on: [],
    }

    constructor(...work: Array<WorkStep | DemosWorkOperation>) {
        super()
        this.add(...work)
    }

    add(...work: Array<WorkStep | DemosWorkOperation>) {
        for (const w of work) {
            super.addWork(w)
            this.operationScript.order.push(w.id)
        }
    }

    override addWork(...work: Array<WorkStep | DemosWorkOperation>): void {
        this.add(...work)
    }
}
