# Demos SDKs

To use this package, install it in your project using:

```sh
yarn add @kynesyslabs/demosdk

# or

npm -i @kynesyslabs/demosdk
```

#

```sh
yarn build
```

Then, in your project, run:

```sh
yarn add file:../path/to/sdks
```

Assuming both repos are in the same directory, that would be:

```sh
yarn add file:../sdks
```

Then you can import stuff from the package normally, eg:

```ts
import { Demos } from "@kynesyslabs/demosdk/websdk"
```

> [!IMPORTANT]
> Installing this package will replace the NPM version of the package.
>
> Changes to the sdks will not be reflected on your project until you rebuild and reinstall the sdk in your project.

<br>

### Exporting modules

To export a `src/module/index.ts` from the package as a module, configure `package.json` as shown:

```jsonc
"exports": {
    // ...
    "./module": "./build/module/index.js"
}
```

This will allow users to use the module exports as follows:

```js
import { ModuleItem, otherModuleItem } from "@kynesyslabs/demosdk/module"
```

<br>

### Publishing on NPM

Publishing to NPM is automated using a Github Workflow. To publish a new version:

1. Increment the `package.json` version field
2. Commit your changes with a message starting with the word `release`
3. Push to Github.

For example:

```sh
git commit -m "release v1.0.5"
```

The commit will trigger a workflow run to build the files and publish a new version on NPM.

<br>

### Setup pre-push hook

The release pre-push hook will prevent you from pushing a release commit, if the code can't build successfully.

```sh
yarn setup:pre-push
```

The command will copy the pre-push file from `.github/hooks/pre-push` to the `.git/hooks` directory.

> [!TIP]
> This hook is not pushed to Github, so you need to run the command again if you reclone the repository.

### Tests

```sh
yarn test:multichain           multichain sdks payload generation

yarn test:tx                   sending crosschain pay txs

yarn test:demoswork            demoswork operations

yarn test:native               native pay txs

yarn test:identities           adding xm identities

yarn test:identities:web2      adding web2 identities

yarn test:web2                 using the web2 proxy

yarn test:rubic-service        rubic brigde service
```
