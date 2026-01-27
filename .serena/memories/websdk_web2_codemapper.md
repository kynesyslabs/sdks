# Web2 Proxy Utilities
- `src/websdk/Web2Calls.ts` validates outbound HTTP targets (`getCanonicalHttpUrlOrThrow`) and exposes `web2Calls` methods for proxied fetches.
- Includes `Web2Proxy` class handling request orchestration and `Web2InvalidUrlError` guards against unsafe endpoints.