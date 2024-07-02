import { WorkStepOutput, XmScript } from "./types"
import { DemosWork } from "./work"

/**
 * Node-side Demos Work. Loads the XMScript sent from the client
 * and prepares it for execution.
 */
class NodeWork extends DemosWork {
    results: Map<string, WorkStepOutput> = new Map()

    loadScript(script: XmScript) {
        let newscript = script
        newscript.operationOrder = new Set(script.operationOrder)

        this.script = script
        return this
    }

    execute() {
        // TODO: Parse Xmscript and execute operations.
    }
}
