# DEMOS SDKs

This repo contains all the Demos SDKs

## Usage

### Core

TODO: Update once ported.

### Multichain SDKs

Check out the [multichain documentation](./documentation/multichain/README.md).

## Organization

The packages are structured like this:

```sh
./src
├── core # blockchain interface stuff <todo: port from frontend>
│
├── types # shared types
│
├── multichain
│   ├── core     # default chain sdk implementation for all chains
│   ├── localsdk # local sdks for all chains
│   └── websdk   # web sdks for all chains
```

## Development setup
```sh
yarn install
```

## Running tests

```sh
# multichain
yarn test:multichain
```

## Publishing on NPM

TODO!

## What has Changed?

### EVM Web sdk

#### 1. Constructor parameter order:

previous: `rpc_url`, `isEIP1559`, `chain_id` \
new: `rpc_url`, `chain_id`, `isEIP1559`

## TODOs

-   Review `getBalance` return type. Should it be a string or an object?
-
