import AbstractionProvidersInstance from "./AbstractionProviders"

export default function registerXrpProviders() {
    // Mainnet
    AbstractionProvidersInstance().xrp.mainnet = [
        "wss://xrplcluster.com",
        "wss://s1.ripple.com:51234",
    ]

    // Testnet
    AbstractionProvidersInstance().xrp.testnet = [
        "wss://s.altnet.rippletest.net:51233",
    ]
}
