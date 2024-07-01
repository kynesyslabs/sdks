import { v4 as uuidv4 } from "uuid"

import { stepKeys } from "./types"
import { WorkStep } from "./workstep"

export function getNewUID() {
    return uuidv4()
}

export function equalTo(step: WorkStep, key: stepKeys, value: any) {
    return {
        step: step,
        operator: "equality",
        key: key,
        value: value,
    }
}
