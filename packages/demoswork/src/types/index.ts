import { WorkStep } from "../workstep"
import { DemosWorkOperationScripts, OperationOutputKey } from "./operations"
import { StepOutputKey } from "./steps"

/**
 * The final shape of the work script
 */
export interface DemoScript {
    operationOrder: Set<string>
    operations: { [key: string]: DemosWorkOperationScripts }
    steps: { [key: string]: WorkStep }
}


export type DemosWorkOutputKey = OperationOutputKey | StepOutputKey
export {
    BaseOperationScript, BinaryConditionParams, ConditionParams, ConditionalOperationScript, DemosWorkOperationScripts, DemosWorkOperations, OperationOutputKey, OperationScript, OperationType, UnaryConditionParams
} from "./operations"
export {
    DataTypes, operators
} from "./datatypes"
export { Conditional, ICondition, Operand, StepOutputKey, WorkStepInput, XmStepResult, stepKeys, stepKeysEnum } from "./steps"