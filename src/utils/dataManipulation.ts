export async function ObjectToHex(obj: any): Promise<string> {
    return Buffer.from(JSON.stringify(obj)).toString("hex")
}

export async function HexToObject(hex: string): Promise<any> {
    return JSON.parse(Buffer.from(hex, "hex").toString("utf8"))
}

/* REVIEW Could we possibly ditch the below functions? */

// INFO forgeBuffer comes in as the raw result of forge methods
export function ForgeToHex(forgeBuffer: any) {
    let rebuffer = Buffer.from(forgeBuffer)
    forgeBuffer = rebuffer.toString("hex")
    return "0x" + forgeBuffer
}

// INFO finalArray must come out as an acceptable input for forge methods
// NOTE The above and the below must be revertible with each other
export function HexToForge(forgeString: string) {
    forgeString = forgeString.slice(2)
    let finalArray = new Uint8Array(64)
    //console.log(forgeString)
    for (let i = 0; i < forgeString.length; i += 2) {
        const hexValue = forgeString.substr(i, 2)
        const decimalValue = parseInt(hexValue, 16)
        finalArray[i / 2] = decimalValue
    }
    return finalArray
}

export function copyCreate(obj: any): any {
    return JSON.parse(JSON.stringify(obj))
}
