import { EventEmitter } from "node:events"
import type { Client } from "xrpl"

// Exercise the adapter without loading other chains or constructing a real client.
jest.mock("@/multichain/core", () => ({
    ...require("../../multichain/core/types/defaultChain"), required: undefined,
}))
jest.mock("xrpl", () => ({
    Client: undefined, Wallet: undefined, convertStringToHex: undefined, xrpToDrops: undefined,
}))
jest.mock("ripple-keypairs", () => ({ sign: undefined, verify: undefined }))
const { XRPL }: typeof import("../../multichain/core/xrp") = require("../../multichain/core/xrp")

function fixture() {
    const events = new EventEmitter()
    const connect = jest.fn(async () => { events.emit("connected") })
    const adapter = new XRPL("")
    adapter.provider = Object.assign(events, { connect }) as unknown as Client
    return { adapter, connect, events }
}

test("connect reports success when the second attempt connects", async () => {
    const { adapter, connect } = fixture()
    connect.mockRejectedValueOnce(new Error("offline"))

    const result = await adapter.connect(false)
    expect(connect).toHaveBeenCalledTimes(2)
    expect([result, adapter.connected]).toEqual([true, true])
})

test("connect reports failure after three rejected attempts", async () => {
    const { adapter, connect } = fixture()
    connect.mockRejectedValue(new Error("offline"))

    const result = await adapter.connect(false)
    expect(connect).toHaveBeenCalledTimes(3)
    expect([result, adapter.connected]).toEqual([false, false])
})

test("a disconnect gets a fresh three-attempt budget", async () => {
    const { adapter, connect, events } = fixture()
    const error = new Error("offline")
    connect.mockRejectedValueOnce(error)
    await adapter.connect()

    connect.mockClear().mockRejectedValueOnce(error).mockRejectedValueOnce(error)
    // EventEmitter.emit does not await async listeners; await the registered handler.
    await events.listeners("disconnected")[0](1006)
    expect(connect).toHaveBeenCalledTimes(3)
    expect(adapter.connected).toBe(true)
})
