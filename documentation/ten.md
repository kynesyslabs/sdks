## Some issues I'm facing

I'm unable to fetch the transaction count given the correct token and it's associated address:

```sh
$ curl https://testnet.ten.xyz/v1/?token=79A8DFE7D9020080C5901FC9815F329A9741289F -X POST -H "Content-Type: application/json" --data '{"method": "eth_getTransactionCount","params": ["0x4Ce3d1Dcba957E94c1B0Fd0f6527E16eFF2c5d1c", "latest"],"id":1,"jsonrpc":"2.0"}'

# {"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"internal system error"}}
```

```ts
const rpc_url = "https://testnet.ten.xyz/v1/?token=79A8DFE7D9020080C5901FC9815F329A9741289F"

const provider = new web3.Web3Eth(rpc_url)
await provider.getTransactionCount("0x4Ce3d1Dcba957E94c1B0Fd0f6527E16eFF2c5d1c")

// InvalidResponseError: Returned error: internal system error
```

