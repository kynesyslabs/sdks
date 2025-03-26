# Rubic Bridge Test Documentation

This document explains how to use the tests for the RubicService in the `rubic.test.ts` file. It covers the steps to run tests for `getTrade`, `executeTrade` with mock data, and `executeTrade` with real funds.

Before running the tests, first need to run the `node` repository.
After that you can run the first 2 tests `getTrade` and `executeTrade` with mock data.
For these tests don't need to change the private key for the wallet connect part

To run `executeTrade` with the real funds test, first need to remove the `skip` operator from the test, you can set it to `only`.
To run this test also need to change the private key in the `rubic.test.ts`, in the wallet should be some funds to do a real swap.

To run tests, use this command

```ts
yarn test:rubic-service
```

`getTrade` method

This method is responsible for calculating and retrieving the best cross-chain trade option based on the provided parameters.
Returns the best trade option or an error if no valid trades are found.

`executeTrade` method

The method interacts with the SDK to manage the trade swap, allowance, approval, transaction submission, and confirmation.
Returns transaction receipt.

Example of Payload for both methods

```ts
const payload: BridgeTradePayload = {
                fromToken: "USDT",
                toToken: "USDT",
                amount: 1,
                fromChainId: 137,
                toChainId: 1,
            }
```
