export async function sleep(time: number) {
    return new Promise(resolve => setTimeout(resolve, time))
}

export * as dataManipulation from "./dataManipulation"
export { deserializeUint8Array, serializeUint8Array } from "./uint8Serialize"