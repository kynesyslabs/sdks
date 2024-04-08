# DEMOS SDKs

This repo contains all the Demos SDKs

## Usage

### Core

TODO: Update once ported.

### Multichain SDKs

Check out the [multichain documentation](./documentation/multichain/README.md).

## Organization

The packages are structured like this:

```
~
├── core # blockchain interface stuff <todo: port from frontend>
│
├── multichain
│   ├── core     # default chain sdk implementation for all chains
│   ├── localsdk # local sdks for all chains
│   └── websdk   # web sdks for all chains
```

## Development setup

> [!TIP]
> Quick setup (installs dependencies for all packages)
>
> ```sh
> yarn install
> ```

This monorepo uses the [yarn workspaces](https://yarnpkg.com/features/workspaces) feature which is only available on the non-classic Yarn version `>2.x` to organize packages. Yarn binaries and friends are installed in the `.yarn` directory, so you don't need to install them.

To install dependencies for all packages, run:

```sh
yarn install
```

To run a command in a specific package, eg. install dependencies, use:

```sh
yarn workspace <package-name> <command-name>

# yarn workspace @kynesyslabs/mx-core install
# yarn workspace @kynesyslabs/mx-core add @somepackage
```

Dependencies for packages are installed in a shared `node_modules` directory at the root of the monorepo. Linking to the node modules is automatically handled by the yarn workspace.

To install a local package in a package, define it as a workspace dependency in its `package.json`:

```json
{
    "dependencies": {
        "@kynesyslabs/sdk-name": "workspace:^"
    }
}
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
