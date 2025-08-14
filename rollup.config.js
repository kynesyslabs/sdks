import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';
import { rmSync } from 'fs';

// Clean build directory
rmSync('build', { recursive: true, force: true });

const isProduction = process.env.BUILD === 'production';

const createBundle = (input, output, format = 'es') => ({
  input,
  output: {
    file: output,
    format,
    sourcemap: !isProduction,
    exports: 'named',
    generatedCode: {
      preset: 'es2015',
      arrowFunctions: true,
      constBindings: true,
      objectShorthand: true,
      symbols: false
    }
  },
  plugins: [
    json(),
    nodeResolve({
      preferBuiltins: true
    }),
    commonjs({
      include: /node_modules/
    }),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
      outDir: './build',
      exclude: ['src/**/tests/**/*']
    }),
    terser({
      format: {
        comments: false
      },
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug']
      },
      mangle: {
        toplevel: true
      }
    })
  ],
  external: [
    '@aptos-labs/ts-sdk',
    '@bitcoinerlab/secp256k1',
    '@cosmjs/proto-signing',
    '@cosmjs/stargate',
    '@metaplex-foundation/js',
    '@multiversx/sdk-core',
    '@multiversx/sdk-extension-provider',
    '@multiversx/sdk-network-providers',
    '@multiversx/sdk-wallet',
    '@noble/curves',
    '@noble/hashes',
    '@noble/post-quantum',
    '@project-serum/anchor',
    '@roamhq/wrtc',
    '@simplewebauthn/browser',
    '@simplewebauthn/server',
    '@solana/buffer-layout',
    '@solana/web3.js',
    '@ton/core',
    '@ton/crypto',
    '@ton/ton',
    'axios',
    'big-integer',
    'bignumber.js',
    'bip32',
    'bitcoinjs-lib',
    'bitcoinjs-message',
    'bs58',
    'buffer',
    'dotenv',
    'ecpair',
    'ethers',
    'falcon-js',
    'falcon-sign',
    'js-sha3',
    'libsodium-wrappers-sumo',
    'lodash',
    'mlkem',
    'near-api-js',
    'node-forge',
    'node-seal',
    'ntru',
    'pqcrypto',
    'protobufjs',
    'ripple-keypairs',
    'rubic-sdk',
    'simple-peer',
    'socket.io-client',
    'sphincs',
    'superdilithium',
    'web3',
    'xrpl'
  ],
  treeshake: {
    preset: 'smallest',
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    unknownGlobalSideEffects: false,
    tryCatchDeoptimization: false,
    correctVarValueBeforeDeclaration: false,
    manualPureFunctions: ['styled', 'local', 'createElement', 'h']
  }
});

const config = [
  // Main bundle with aggressive tree-shaking
  createBundle('src/index.ts', 'build/index.js', 'es'),
  
  // Submodule bundles with tree-shaking
  createBundle('src/websdk/index.ts', 'build/websdk/index.js', 'es'),
  createBundle('src/demoswork/index.ts', 'build/demoswork/index.js', 'es'),
  createBundle('src/multichain/core/index.ts', 'build/multichain/core/index.js', 'es'),
  createBundle('src/multichain/websdk/index.ts', 'build/multichain/websdk/index.js', 'es'),
  createBundle('src/multichain/localsdk/index.ts', 'build/multichain/localsdk/index.js', 'es'),
  createBundle('src/wallet/index.ts', 'build/wallet/index.js', 'es'),
  createBundle('src/abstraction/index.ts', 'build/abstraction/index.js', 'es'),
  createBundle('src/l2ps/index.ts', 'build/l2ps/index.js', 'es'),
  createBundle('src/utils/index.ts', 'build/utils/index.js', 'es'),
  createBundle('src/encryption/index.ts', 'build/encryption/index.js', 'es'),
  createBundle('src/bridge/index.ts', 'build/bridge/index.js', 'es')
];

export default config;
