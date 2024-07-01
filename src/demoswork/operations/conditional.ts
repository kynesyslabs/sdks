import { Condition, XmScript } from "../types";
import { WorkStep } from "../workstep";

class IfCondition {

}

class Conditional {
    startingCondition: Condition
    script: XmScript

    constructor(script: XmScript, condition: Condition){
        this.script = script
        this.startingCondition = condition
    }

    then(step: WorkStep){
        return
    }

    elif(condition: Condition){
        return
    }

    else(condition: Condition){
        return new IfCondition()
    }
}