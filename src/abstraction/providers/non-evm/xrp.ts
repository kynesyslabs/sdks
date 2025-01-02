import AbstractionProvidersInstance from "../AbstractionProviders"

export default function registerXrpProviders() {
    // Mainnet
    AbstractionProvidersInstance().xrp.mainnet = [
        "wss://xrplcluster.com", // Community cluster
        "wss://s1.ripple.com:51233", // Ripple node
        "wss://s2.ripple.com:51233", // Ripple node backup
        "wss://s.devnet.rippletest.net:51233", // DevNet
        "wss://xrpl.ws", // XRPL Foundation
    ]

    // Testnet
    AbstractionProvidersInstance().xrp.testnet = [
        "wss://s.altnet.rippletest.net:51233", // Official testnet
        "wss://testnet.xrpl-labs.com", // XRPL Labs testnet
    ]
}
