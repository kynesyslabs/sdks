# TLSNotary Browser Setup

## Dependencies

```json
{
  "dependencies": {
    "@kynesyslabs/demosdk": "^2.7.9",
    "tlsn-js": "^0.1.0-alpha.12",
    "react": "^19.x",
    "react-dom": "^19.x"
  },
  "devDependencies": {
    "webpack": "^5.x",
    "webpack-cli": "^4.x",
    "webpack-dev-server": "^4.x",
    "ts-loader": "^9.x",
    "html-webpack-plugin": "^5.x",
    "copy-webpack-plugin": "^11.x",
    "crypto-browserify": "^3.x",
    "stream-browserify": "^3.x",
    "buffer": "^6.x",
    "process": "^0.11.x"
  }
}
```

## Webpack Configuration

```javascript
// webpack.config.cjs
const webpack = require('webpack');
const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: {
    app: path.join(__dirname, 'src', 'app.tsx'),
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    publicPath: '/',
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: ['ts-loader'],
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    fallback: {
      // Required polyfills
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      vm: require.resolve('vm-browserify'),
      // Stub out Node.js modules
      fs: false,
      path: false,
      os: false,
    },
  },
  plugins: [
    // Copy tlsn-js WASM files to dist
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'node_modules/tlsn-js/build',
          to: path.join(__dirname, 'dist'),
          force: true,
        },
      ],
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'index.html'),
      filename: 'index.html',
    }),
    // Provide Node.js globals
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  ],
  devServer: {
    port: 3000,
    host: 'localhost',
    hot: true,
    // CRITICAL: Required for SharedArrayBuffer (WASM threads)
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
};
```

## Critical: Cross-Origin Isolation Headers

TLSNotary WASM requires `SharedArrayBuffer` which needs cross-origin isolation:

### Development (webpack-dev-server)

```javascript
devServer: {
  headers: {
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
  },
}
```

### Production (nginx)

```nginx
add_header Cross-Origin-Embedder-Policy "require-corp" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
```

### Production (Express/Node.js)

```javascript
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});
```

## WASM Files

The `tlsn-js` package includes WASM files that must be served:

```
node_modules/tlsn-js/build/
├── tlsn_wasm.js
├── tlsn_wasm_bg.wasm
└── worker.js
```

Copy these to your dist folder (handled by CopyWebpackPlugin above).

## TLSNotaryClient Wrapper

Create a client wrapper for browser usage:

```typescript
// TLSNotaryClient.ts
import * as Comlink from 'comlink';

interface TLSNotaryConfig {
  notaryUrl: string;
  rpcUrl: string;
  loggingLevel?: 'Debug' | 'Info' | 'Warn' | 'Error';
}

export class TLSNotaryClient {
  private config: TLSNotaryConfig;
  private worker: any = null;

  constructor(config: TLSNotaryConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    // Load WASM worker
    const worker = new Worker('/worker.js', { type: 'module' });
    this.worker = Comlink.wrap(worker);
    await this.worker.init({
      loggingLevel: this.config.loggingLevel || 'Info',
    });
    
    // Expose worker globally for direct access
    (window as any).__worker = this.worker;
  }

  async requestProxy(targetUrl: string): Promise<ProxyResponse> {
    const response = await fetch(`${this.config.rpcUrl}/requestProxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUrl }),
    });
    return response.json();
  }

  async verify(presentationJSON: string): Promise<VerificationResult> {
    const presentation = typeof presentationJSON === 'string'
      ? JSON.parse(presentationJSON)
      : presentationJSON;
    return this.worker.Verifier.verify(presentation);
  }

  updateConfig(config: Partial<TLSNotaryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
```

## HTML Template

```html
<!-- src/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TLSNotary App</title>
</head>
<body>
  <div id="root"></div>
</body>
</html>
```

## TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["DOM", "ES2020"]
  },
  "include": ["src/**/*"]
}
```

## Related Memories

- `tlsnotary_overview`: Architecture and flow overview
- `tlsnotary_sdk_integration`: SDK API reference
- `tlsnotary_complete_flow`: Full implementation example
