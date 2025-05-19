
```diff
- prepareXMPayload(xm_payload: XMScript, keypair: IKeyPair): Promise<Transaction>
+ prepareXMPayload(xm_payload: XMScript, demos: Demos): Promise<Transaction>
```

- Identity payloads need to be redeployed
- Public keys will change
- Identities.createWeb2ProofPayload will now take a Demos instance instead of an ed25519 keypair.

## Todo
- Put back global demos object 
- Remove signature verification from secretary routine and handle them in consensus_routine handler in server_rpc.ts
- FIX: Hello request request signature format and handling on receiving end.
- Refactor methods that use demos.getAddress to use demos.getAddress("ed25519")