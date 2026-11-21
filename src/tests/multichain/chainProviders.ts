import { getHttpEndpoint } from "@orbs-network/ton-access"
import { clusterApiUrl } from "@solana/web3.js"

export default {
    eth: {
        // Using a public endpoint avoids auth issues during CI read-only tests
        mainnet: "https://ethereum.publicnode.com",
        sepolia: "https://ethereum-sepolia-rpc.publicnode.com",
        goerli: "https://ethereum-goerli.publicnode.com",
    },
    xrpl: {
        mainnet: "wss://s1.ripple.com:51234/",
        testnet: "wss://s.altnet.rippletest.net:51233/",
    },
    egld: {
        mainnet: "https://api.multiversx.com",
        testnet: "https://testnet-api.multiversx.com",
    },
    filecoin: {
        mainnet: "https://rpc.ankr.com/filecoin",
        calibration: "https://rpc.ankr.com/filecoin_testnet",
        testnet: "https://rpc.ankr.com/filecoin_testnet",
    },
    ibc: {
        // Stargaze 👇
        mainnet: "https://stargaze-rpc.publicnode.com:443",
        testnet: "https://rpc.elgafar-1.stargaze-apis.com",
    },
    solana: {
        mainnet: "https://britta-qyzo1g-fast-mainnet.helius-rpc.com",
        //TODO: Change to testnet when we have a testnet faucet
        // using devnet as testnet faucet is broken 👇
        testnet: clusterApiUrl("devnet"),
        devnet: clusterApiUrl("devnet"),
    },
    ton: {
        mainnet: getHttpEndpoint({
            network: "mainnet",
        }),
        testnet: getHttpEndpoint({
            network: "testnet",
        }),
    },
    near: {
        mainnet: "https://rpc.near.org",
        testnet: "https://rpc.testnet.near.org",
    },
    btc: {
        mainnet: "https://blockstream.info/api",
        testnet: "https://blockstream.info/testnet/api",
    },
    tron: {
        mainnet: "https://api.trongrid.io",
        testnet: "https://api.shasta.trongrid.io",
        shasta: "https://api.shasta.trongrid.io",
        nile: "https://nile.trongrid.io",
    },
}
