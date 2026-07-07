// Optional Rubic cross-chain surface.
//
// Importing this module pulls `rubic-sdk` at runtime — an `optionalDependency`
// whose peer-dep tree can't always resolve. It therefore lives on its own
// subpath (`@kynesyslabs/demosdk/bridge/rubic`) and is deliberately NOT part of
// the `bridge` or `websdk` barrels, so a clean install of the SDK keeps working
// even when rubic-sdk isn't (or can't be) installed. Import this only if you
// actually run cross-chain trades and have rubic-sdk available.
export {
    BLOCKCHAIN_NAME,
    CROSS_CHAIN_TRADE_TYPE,
    CrossChainTrade,
    RubicSdkError,
    WrappedCrossChainTrade,
} from "rubic-sdk"
