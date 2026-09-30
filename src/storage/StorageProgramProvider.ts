import type { StorageProgramPayload } from "../types/blockchain/TransactionSubtypes/StorageProgramTransaction"

/**
 * Minimal interface matching the Demos browser wallet provider.
 * Compatible with window.demosProvider or any provider returned
 * by the demosAnnounceProvider event.
 */
export interface DemosWalletProvider {
    request: (opts: { method: string; params: any[] }) => Promise<any>
}

/**
 * Routes storage program transactions through the Demos browser wallet extension.
 *
 * The dApp builds the payload using StorageProgram helpers, then passes it here.
 * The wallet shows a confirmation popup (operation type, address, data preview, fee)
 * and the user approves or rejects.
 *
 * @example
 * // Build payload with the existing SDK helper
 * const payload = StorageProgram.createStorageProgram(owner, name, data, "json", acl, { nonce })
 *
 * // Route through wallet — popup opens for user confirmation
 * const result = await StorageProgramProvider.submitViaWallet(window.demosProvider, payload)
 * const txHash = result?.data?.result?.extra?.txHash
 */
export class StorageProgramProvider {
    /**
     * Submit any storage operation through the browser wallet extension.
     * Resolves with the DemosProviderResponse once the user approves or rejects.
     */
    static async submitViaWallet(
        provider: DemosWalletProvider,
        payload: StorageProgramPayload
    ): Promise<any> {
        return provider.request({
            method: "storageTransaction",
            params: [payload],
        })
    }
}
