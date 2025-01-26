import forge from "node-forge"
import { EncryptedTransaction } from "../blockchain/encryptedTransaction"

export interface SubnetPayload {
    type: "subnet"
    // ? Unsure if we should use this type as it can be circular, or if we should create a data type for the subnet itself
    // NOTE ^ Anyway, this is already being checked in the L2PS class `encryptTx` method
    data: EncryptedTransaction 
    // TODO Upon receiving a subnet tx at the node level, we should extract it as it is and add it to the block's proper field
}
