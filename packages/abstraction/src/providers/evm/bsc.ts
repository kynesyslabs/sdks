import AbstractionProvidersInstance from "../AbstractionProviders"

export default function registerBscProviders() {
    //TODO: Change to private third-party service providers in production for better performance and reliability

    // Mainnet
    AbstractionProvidersInstance().registerEVM("bsc", [
        "https://bsc-dataseed.bnbchain.org",
        "https://bsc-dataseed.nariox.org",
        "https://bsc-dataseed.defibit.io",
        "https://bsc-dataseed.ninicoin.io",
        "https://bsc.nodereal.io",
        "https://bsc-dataseed-public.bnbchain.org",
        "https://bnb.rpc.subquery.network/public",
    ])

    // Testnet
    AbstractionProvidersInstance().registerEVM("bsc_testnet", [
        "https://bsc-testnet-dataseed.bnbchain.org",
        "https://bsc-testnet.bnbchain.org",
        "https://bsc-prebsc-dataseed.bnbchain.org",
    ])
}
