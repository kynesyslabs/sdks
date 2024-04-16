# DEMOS SDKs

This repo contains all the Demos SDKs

## Usage

### Multichain SDKs

Check out the [multichain documentation](./documentation/multichain/README.md).

## Organization

The packages are structured like this:

```sh
./src
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


### Adding stuff
Create a new folder in the `src` directory and add your stuff. Export items on the `index.ts` file in your new folder. Then add an export entry in `package.json` as shown:

```json
"exports": {
    ...
    "./stuff": "./build/stuff/index.js"
}
```

This will allow users to use the new things as follows:

```js
import { Stuff, otherStuff } from "@kynesyslabs/demosdk/stuff"
```

### Running tests

```sh
# multichain
yarn test:multichain
```

### Publishing on NPM

Publishing to NPM is automated using a Github Workflow. To publish a new version:

1. Incrememt the `package.json` version field
2. Commit your changes with a message starting with the word `release`
3. Push to Github.

```sh
# Example:
git commit -m "release v1.0.5"
```

The commit will trigger a workflow run to build the files and publish a new version on NPM.

## What has Changed?

### EVM Web sdk

#### 1. Constructor parameter order:

previous: `rpc_url`, `isEIP1559`, `chain_id` \
new: `rpc_url`, `chain_id`, `isEIP1559`

## TODOs

-   Review `getBalance` return type. Should it be a string or an object?