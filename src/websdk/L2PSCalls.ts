import { demos } from '@/websdk/demos';
import { EncryptedTransaction } from '@/types/blockchain/encryptedTransaction';

// Exporting the l2ps calsl for demos.ts
const l2psCalls = {
    // Retrieving a transaction from the L2PS
    retrieve: async function (eTxHash: string,
        L2PSId: string): Promise<EncryptedTransaction> {
        return await demos.call(
            'l2ps',
            'retrieve',
            { eTxHash: eTxHash, L2PSId: L2PSId }, // Data
        ) as EncryptedTransaction
    },
    // Retrieving all transactions from the L2PS in a specific block
    retrieveAll: async function (L2PSId: string, blockNumber: number): Promise<EncryptedTransaction[]> {
        return await demos.call(
            'l2ps',
            'retrieveAll',
            { L2PSId: L2PSId, blockNumber: blockNumber }, // Data
        ) as EncryptedTransaction[]
    },
    // Registering a transaction in the L2PS
    // ? Maybe we should use the confirm / verify logic here too
    register: async function (eTx: EncryptedTransaction) {
        return await demos.call(
            'l2ps',
            'register',
            { eTx: eTx }, // Data
        )
    },
}

export { l2psCalls }