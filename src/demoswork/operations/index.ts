import {
    OperationOutputKey,
    OperationScript,
    OperationType,
} from "@/types/demoswork/operations"

import { getNewUID } from "../utils"
import { WorkStep } from "../workstep"
import { DataTypes } from "@/types/demoswork/datatypes"

export abstract class DemosWorkOperation {
    id: string = "op_" + getNewUID()
    abstract type: OperationType

    steps: Record<string, WorkStep> = {}
    operations: Set<DemosWorkOperation> = new Set()
    operationScript: OperationScript = {
        id: this.id,
        operationType: null,
    }
    output = {
        success: {
            type: DataTypes.work as DataTypes.work,
            src: {
                self: this as DemosWorkOperation,
                key: "output.success",
            },
        },
    }

    addWork(work: WorkStep | DemosWorkOperation) {
        // INFO: The action can be a step or an operation
        // If it is an operation, copy its steps into this operation
        // if is a step, add it to the steps of this operation
        if (work.id.startsWith("op_")) {
            this.operations.add(work as DemosWorkOperation)

            // INFO: Inherit the steps of the operation
            for (const stepUID in (work as DemosWorkOperation).steps) {
                this.steps[stepUID] = (work as DemosWorkOperation).steps[
                    stepUID
                ]
            }

            // INFO: Inherit the operations of the operation
            for (const operation of (work as DemosWorkOperation).operations) {
                this.operations.add(operation)
            }
            return
        }

        if (work.id.startsWith("step_")) {
            this.steps[work.id] = work as WorkStep
            return
        }

        throw new Error("Invalid work unit with id:" + work.id)
    }

    // execute() {
    //     throw new Error("Method not implemented.")
    // }
}
