import { v4 as uuidv4 } from "uuid"

export function getNewUID() {
    return uuidv4()
}

/**
 * Get the value of a property given a path in an object.
 * The path should be a string of property names separated by dots.
 *
 * @param obj The object to traverse
 * @param path The path of the property to get
 * @returns The value of the property at the path
 *
 * @example getValue(myObject, "nested.property")
 */
export function getValue(obj: Object, path: string) {
    // Split the path string into an array of property names
    const properties = path.split(".")

    // Traverse the object using the property names
    let value = obj

    for (const prop of properties) {
        if (value && typeof value === "object") {
            value = value[prop]
        } else {
            return undefined // Return undefined if the property doesn't exist
        }
    }

    return value
}

/**
 * Compare two values using the specified operator
 *
 * @param a First value
 * @param b Second value
 * @param operator Comparison operator
 * @returns The result of the comparison (boolean)
 */
export function compare(
    a: any,
    b: any,
    operator: string,
    validate_only: boolean = false,
): boolean {
    const operations = {
        ">": (a: any, b: any) => a > b,
        ">=": (a: any, b: any) => a >= b,
        "<": (a: any, b: any) => a < b,
        "<=": (a: any, b: any) => a <= b,
        "==": (a: any, b: any) => a == b,
        "===": (a: any, b: any) => a === b,
        "!=": (a: any, b: any) => a != b,
        "!==": (a: any, b: any) => a !== b,
    }

    if (!operations.hasOwnProperty(operator)) {
        throw new Error("Invalid operator:" + operator)
    }

    if (validate_only) {
        return true
    }

    return operations[operator](a, b)
}
