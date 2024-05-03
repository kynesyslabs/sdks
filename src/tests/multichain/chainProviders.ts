import { clusterApiUrl } from "@solana/web3.js";

export default {
    eth: {
        mainnet: "https://rpc.ankr.com/eth",
        sepolia: "https://rpc.ankr.com/eth_sepolia",
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
        mainnet: "",
        // Stargaze 👇
        testnet: "https://rpc.elgafar-1.stargaze-apis.com",
    },
    solana: {
        mainnet: clusterApiUrl("mainnet-beta"),
        // using devnet as testnet faucet is broken 👇
        testnet: clusterApiUrl('devnet')
    }
}
