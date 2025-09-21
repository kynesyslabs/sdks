import { SupportedChain, supportedChains, supportedNonEVMChains } from "./nativeBridgeTypes"

/**
* Validates the chain
* @param chain
* @param isOrigin (useful for error messages)
*/
export function validateChain(
    chain: SupportedChain,
) {
    if (!supportedChains.includes(chain)) {
        throw new Error(
            `Invalid chain: ${chain} is not a supported chain`,
        )
    }
}