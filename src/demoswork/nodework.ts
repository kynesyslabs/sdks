import { XmScript } from "./types"
import { DemosWork } from "./work"

/**
 * Node-side Demos Work. Loads the XMScript sent from the client
 * and prepares it for execution.
 */
class NodeDemosWork extends DemosWork {
    #iscript: XmScript

    fromScript(script: XmScript) {
        let newscript = script
        newscript.operationOrder = new Set(script.operationOrder)

        this.#iscript = script
        return this
    }
}
