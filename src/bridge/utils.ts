import { SupportedEVMChain, supportedEVMChains, SupportedNonEVMChain, supportedNonEVMChains } from "./nativeBridgeTypes"

/**
* Validates the chain
* @param chain
* @param isOrigin (useful for error messages)
*/
export function validateChain(
    chain: SupportedEVMChain | SupportedNonEVMChain,
    isOrigin: boolean,
) {
    const chainTypeStr = isOrigin ? "origin" : "destination"

    if (chain.startsWith("evm")) {
        if (!supportedEVMChains.includes(chain as SupportedEVMChain)) {
            throw new Error(
                `Invalid ${chainTypeStr} chain: ${chain} is not a supported EVM`,
            )
        }
    } else {
        if (
            !supportedNonEVMChains.includes(
                chain as SupportedNonEVMChain,
            )
        ) {
            throw new Error(
                `Invalid ${chainTypeStr} chain: ${chain} is not a supported chain`,
            )
        }
    }
}