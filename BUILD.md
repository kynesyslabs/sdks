# Build Process

This project uses Rollup for building with better tree-shaking and bundling capabilities.

## Build Commands

- `yarn build` - Production build using Rollup + TypeScript declarations (optimized, no source maps)
- `yarn build:dev` - Development build with source maps for debugging
- `yarn build:js` - Build only JavaScript bundles using Rollup
- `yarn build:types` - Generate only TypeScript declarations
- `yarn build:tsc` - Legacy TypeScript build (kept for reference)

## Build Output

The build process creates:

1. **JavaScript bundles** - Optimized CommonJS modules with tree-shaking
2. **TypeScript declarations** - `.d.ts` files for type support
3. **Source maps** - Available in development builds only

## Build Sizes

- **Production build**: ~3.7MB (optimized, no source maps)
- **Development build**: ~15MB (includes source maps for debugging)

## Directory Structure

The build output maintains the same structure as the source:

```
build/
├── index.js
├── index.d.ts
├── websdk/
│   ├── index.js
│   ├── index.d.ts
│   └── ...
├── multichain/
│   ├── core/
│   ├── websdk/
│   └── localsdk/
└── ...
```

## Benefits of Rollup

- **Better tree-shaking** - Unused code is eliminated from bundles
- **Smaller bundle sizes** - Production builds are ~75% smaller than legacy builds
- **Faster builds** - Optimized bundling process
- **ES modules support** - Better compatibility with modern tools
- **Production optimization** - Automatic minification and dead code elimination

## Dependencies

The build process treats all external dependencies as external, ensuring they're not bundled and can be provided by the consuming application.
