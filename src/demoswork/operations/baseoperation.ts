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
        work: [],
    }

    constructor(...work: Array<WorkStep | DemosWorkOperation>) {
        super()
        this.add(...work)
    }

    add(...work: Array<WorkStep | DemosWorkOperation>) {
        for (const w of work) {
            this.operationScript.work.push(w.id)
            super.addWork(w)
        }
    }

    override addWork(...work: Array<WorkStep | DemosWorkOperation>): void {
        this.add(...work)
    }
}
