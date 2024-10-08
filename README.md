# @kynesyslabs/demosdk

Demos SDKs metapackage

### Multichain SDKs Usage

Check out the [multichain documentation](./documentation/multichain/README.md).

### Adding stuff

Create a new folder in the `src` directory and add your stuff. Export items on the `index.ts` file in your new folder. Then add an export entry in `package.json` as shown:

```jsonc
"exports": {
    // ...
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

### Setup pre-push hook

The release pre-push hook will prevent you from pushing a release commit, if the code can't build.

```sh
yarn setup:pre-push
```

The command will copy the pre-push file from `.github/hooks/pre-push` to the `.git/hooks` directory.

> [!TIP]
> This hook is not pushed to Github, so you need to run the command again if you reclone the repository.
