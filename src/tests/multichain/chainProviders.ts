import { getHttpEndpoint } from "@orbs-network/ton-access"
import { clusterApiUrl } from "@solana/web3.js"

const tenTestnetBaseUrl = "https://testnet.ten.xyz/v1/?token="
const tenToken = "79A8DFE7D9020080C5901FC9815F329A9741289F"
const tenTokenAlt = "05F95F81F11474C151F27854BD43DDA1C8616BBF"

export default {
    eth: {
        mainnet: "https://rpc.ankr.com/eth",
        sepolia: "https://rpc.ankr.com/eth_sepolia",
        goerli: "https://ethereum-goerli.publicnode.com",
    },
    ten: {
        mainnet: "",
        testnet: tenTestnetBaseUrl + tenToken,
        testnetAlt: tenTestnetBaseUrl + tenTokenAlt,
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
        mainnet: clusterApiUrl("mainnet-beta"),
        // using devnet as testnet faucet is broken 👇
        devnet: clusterApiUrl("devnet"),
    },
    ton: {
        mainnet: "https://toncenter.com/api/v2/jsonRPC",
        testnet: getHttpEndpoint({
            network: "testnet",
        }),
    },
}
