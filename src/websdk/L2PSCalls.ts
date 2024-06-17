import { demos } from '@/websdk/demos';
import { EncryptedTransaction } from '@/types/blockchain/encryptedTransaction';

// Exporting the l2ps calsl for demos.ts
const l2psCalls = {
    // Retrieving a transaction from the L2PS
    retrieve: async function (eTxHash: string,
        L2PSId: string): Promise<EncryptedTransaction> {
        return await demos.call(
            'l2ps',
            '',
            { eTxHash: eTxHash, L2PSId: L2PSId }, // Data
            'retrieve', // Method
        ) as EncryptedTransaction
    },
    // Retrieving all transactions from the L2PS in a specific block
    retrieveAll: async function (L2PSId: string, blockNumber: number): Promise<EncryptedTransaction[]> {
        return await demos.call(
            'l2ps',
            '',
            { L2PSId: L2PSId, blockNumber: blockNumber }, // Data
            'retrieveAll', // Method
        ) as EncryptedTransaction[]
    },
    // Registering a transaction in the L2PS
    // ? Maybe we should use the confirm / verify logic here too
    register: async function (eTx: EncryptedTransaction) {
        return await demos.call(
            'l2ps',
            '',
            { eTx: eTx }, // Data
            'register', // Method
        )
    },
}

export { l2psCalls }