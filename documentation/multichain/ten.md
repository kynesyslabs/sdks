# TEN Integration issue

I’m getting the following error when I try to send a tx to the TEN testnet using `web3js` :

```ts
{
    reason: 'unable to decode EthCall Params - unexpected type supplied in `accessList` field',
    code: 402
}
```

Can you take a look at it before sending to the TEN guys? Just in case I’m missing something.

Pull the sdks repo to get the code.

```bash
git pull

yarn install

# run the existing test code
yarn test:multichain
```

In the TEN test file (`src/tests/multichain/ten.spec.ts`), there’s a `Sending a tx using web3js` test case (at the bottom) that will be executed when you run the test command.

The minimal code for reproducing the error:

```ts
import { Web3 } from "web3"

const rpc_url =
    "https://testnet.ten.xyz/v1/?token=79A8DFE7D9020080C5901FC9815F329A9741289F"
const privateKey =
    "0x0d6033655b0d2903b337dc4a7abfa3c109f8c9484f3f19869525058fd62f61bf"

const web3 = new Web3(rpc_url)
const wallet = web3.eth.accounts.privateKeyToAccount(privateKey)

const feeData = await web3.eth.calculateFeeData()
const signedTx = await wallet.signTransaction({
    from: wallet.address,
    to: "0x4298A9D2A573dA64102255d11d6908b7e3d89b02",
    value: 100000,
    gasLimit: 21000,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    // nonce: 0,
    // chainId: 443,
})

console.log("signedTx: ", signedTx)

try {
    const res = await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    console.log(res)
} catch (error) {
    console.log(error)
}
```
