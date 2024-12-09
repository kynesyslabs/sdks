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

export default class CoinFinder {
    constructor() {}

    // TODO Implement supported chains (e.g. solana, multiversx, etc.) tokens cross search

    static async findSol(targetChain: string) {
        // TODO Validate the target chain id
        // TODO Get the wrapped sol address for the target chain
    }

    static async findMultiversx(targetChain: string) {
        // TODO Validate the target chain id
        // TODO Get the wrapped multiversx address for the target chain
    }

    static async findXRP(targetChain: string) {
        // TODO Validate the target chain id
        // TODO Get the wrapped xrp address for the target chain
    }

    static async findBTC(targetChain: string) {
        // TODO Validate the target chain id
        // TODO Get the wrapped btc address for the target chain
    }
}
