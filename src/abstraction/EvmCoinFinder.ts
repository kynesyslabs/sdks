// Import the singleton instance of the Providers class (already registered with all providers)
import Providers from "./providers"
import { tokenAddresses } from "./providers/CoinAddresses"
// ! Use the Providers singleton with the methods of each chain RPC to find tokens
/**
 * ? For each call, we should probably select a random RPC
 * ? from the Providers singleton and use that one in a for loop
 * ? that breaks when the call is successful.
 * ? This is to prevent any single RPC from being overloaded and
 * ? to be able to fail over to the next one in the list.
 */

export default class EvmCoinFinder {
    constructor() {}

    // TODO Method to find native and wrapped eth across evms (from mainnet to other evms)
    static async findNativeEth(targetChainIds: number[]) {
        // TODO
        // TODO Get the wrapped eth address for the target chain
    }

    // TODO Method to find native and wrapped assets across evms (e.g. opt, arb, etc.)
    static async findNativeAssets(
        sourceChainId: number,
        targetChainIds: number[],
    ) {
        // TODO
    }

    // TODO Method to find token pairs on evms (from an evm to other(s) evm(s))
    static async findTokenPairs(
        tokenAddress: string,
        sourceChainId: number,
        targetChainIds: number[],
    ) {
        // TODO
        // TODO Validate the base token address for the source chain
        // TODO Get the wrapped token address for the target chain if known or return false
    }

    static getNativeforSupportedChain(chain: string, targetChainId: number) {
        // ! Typize this for supported chains
        // TODO validate the chain
        // TODO get the target chain id
        // TODO return the native address for the target chain
    }
}
