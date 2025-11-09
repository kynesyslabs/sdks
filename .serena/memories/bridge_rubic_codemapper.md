# Rubic Bridge Adapter
- `src/bridge/rubicBridge.ts` provides the `RubicBridge` class: `getTrade` fetches quotes, `executeTrade` submits real swaps via Rubic SDK, and `executeMockTrade` simulates responses for testing.
- Designed as the high-level entry when bridging through Rubic aggregators.