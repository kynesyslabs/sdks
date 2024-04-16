import { StatusNative } from "./statusNative"
import { statusNative as StatusProperties } from "./statusProperties"

export default interface AddressInfo {
    native: StatusNative | null
    properties: StatusProperties | null
}
