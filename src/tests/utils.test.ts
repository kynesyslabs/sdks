import { getSampleTranfers, verifyNumberOrder } from "./utils"
import {
    canonicalJSONStringify,
    validatePureJson,
    looksLikeJsonString,
} from "../websdk/utils/canonicalJson"

describe("TEST UTILS TESTS", () => {
    test("getSampleTranfers", () => {
        const address = "0xSomething"
        const length = 3

        const transfers = getSampleTranfers(address, 1, length)

        expect(transfers.length).toEqual(length)
        expect(transfers[0].address).toEqual(address)
    })

    test("verifyNumbersOrder", () => {
        // INFO: Transfers' amounts are sorted in ascending order
        const sorted_items = getSampleTranfers("0xSomething", 5)

        expect(verifyNumberOrder(sorted_items, "amount")).toBe(true)
        expect(verifyNumberOrder(sorted_items.reverse(), "amount")).toBe(false)
    })
})

// Mock crypto for testing (in real environment this would be Node.js crypto)
const mockCreateHash = (data: string) => ({
    update: (input: string) => ({
        digest: (encoding: string) => {
            // Simple hash simulation for testing
            let hash = 0
            for (let i = 0; i < input.length; i++) {
                const char = input.charCodeAt(i)
                hash = (hash << 5) - hash + char
                hash = hash & hash // Convert to 32-bit integer
            }
            return hash.toString(16)
        },
    }),
})

// Use real crypto if available (Node.js environment)
const createHash =
    typeof global !== "undefined" &&
    global.process &&
    global.process.versions &&
    global.process.versions.node
        ? require("crypto").createHash
        : mockCreateHash

describe("canonicalJSONStringify", () => {
    // Test hash determinism across different environments
    test("produces consistent hashes across platforms for complex objects", () => {
        const testObj = {
            "key with spaces": "value",
            another_key: 123,
            nested: {
                z: true,
                a: null,
                array: [1, "two", { c: 3, b: 2 }],
            },
            unicode_key_é: "value_ü",
            empty_array: [],
            empty_object: {},
            number_zero: 0,
            boolean_false: false,
        }

        // Expected canonical JSON with consistent key ordering and encoding
        const expectedCanonicalJson =
            '{"another_key":123,"boolean_false":false,"empty_array":[],"empty_object":{},"key with spaces":"value","nested":{"a":null,"array":[1,"two",{"b":2,"c":3}],"z":true},"number_zero":0,"unicode_key_é":"value_ü"}'
        const expectedHash = createHash("sha256")
            .update(expectedCanonicalJson)
            .digest("hex")

        const actualCanonicalJson = canonicalJSONStringify(testObj)
        const actualHash = createHash("sha256")
            .update(actualCanonicalJson)
            .digest("hex")

        expect(actualCanonicalJson).toBe(expectedCanonicalJson)
        expect(actualHash).toBe(expectedHash)
    })

    test("handles strings with escaped quotes correctly", () => {
        const testObj = {
            key: 'value with "quotes" and \\backslashes\\',
            another: "simple",
        }
        const expectedCanonicalJson =
            '{"another":"simple","key":"value with \\"quotes\\" and \\\\backslashes\\\\"}'
        const expectedHash = createHash("sha256")
            .update(expectedCanonicalJson)
            .digest("hex")

        const actualCanonicalJson = canonicalJSONStringify(testObj)
        const actualHash = createHash("sha256")
            .update(actualCanonicalJson)
            .digest("hex")

        expect(actualCanonicalJson).toBe(expectedCanonicalJson)
        expect(actualHash).toBe(expectedHash)
    })

    test("handles simple objects with consistent key ordering", () => {
        const obj = { b: 2, a: 1 }
        expect(canonicalJSONStringify(obj)).toBe('{"a":1,"b":2}')
    })

    test("handles nested objects and arrays with consistent ordering", () => {
        const obj = { c: { y: 2, x: 1 }, a: [3, { z: 4, w: 5 }] }
        expect(canonicalJSONStringify(obj)).toBe(
            '{"a":[3,{"w":5,"z":4}],"c":{"x":1,"y":2}}',
        )
    })

    test("handles null, boolean, number, string primitives", () => {
        expect(canonicalJSONStringify(null)).toBe("null")
        expect(canonicalJSONStringify(true)).toBe("true")
        expect(canonicalJSONStringify(123)).toBe("123")
        expect(canonicalJSONStringify("test")).toBe('"test"')
    })

    test("produces identical output for multiple calls with same input", () => {
        const obj = { b: 2, a: 1, nested: { y: 2, x: 1 } }
        const first = canonicalJSONStringify(obj)
        const second = canonicalJSONStringify(obj)
        const third = canonicalJSONStringify(obj)

        expect(first).toBe(second)
        expect(second).toBe(third)
        expect(first).toBe(third)
    })

    test("handles empty objects and arrays", () => {
        expect(canonicalJSONStringify({})).toBe("{}")
        expect(canonicalJSONStringify([])).toBe("[]")
        expect(canonicalJSONStringify({ empty: {} })).toBe('{"empty":{}}')
        expect(canonicalJSONStringify({ empty: [] })).toBe('{"empty":[]}')
    })

    test("handles unicode characters consistently", () => {
        const obj = { émoji: "🚀", chinese: "测试", quotes: 'mixed "quotes"' }
        const result = canonicalJSONStringify(obj)
        expect(result).toContain('"émoji":"🚀"')
        expect(result).toContain('"chinese":"测试"')
        expect(result).toContain('"quotes":"mixed \\"quotes\\""')
    })

    test("throws for circular references", () => {
        const obj: any = {}
        obj.a = obj
        expect(() => canonicalJSONStringify(obj)).toThrow(
            "Circular reference detected in JSON payload",
        )
    })

    test("throws for non-plain objects (Date)", () => {
        const obj = { date: new Date() }
        expect(() => canonicalJSONStringify(obj)).toThrow(
            /Only plain objects are supported. Found prototype: Date/,
        )
    })

    test("throws for non-plain objects (Map)", () => {
        const obj = { map: new Map() }
        expect(() => canonicalJSONStringify(obj)).toThrow(
            /Only plain objects are supported. Found prototype: Map/,
        )
    })

    test("throws for unsupported non-JSON types (undefined)", () => {
        const obj = { a: undefined }
        expect(() => canonicalJSONStringify(obj)).toThrow(
            "Non-JSON value encountered: undefined",
        )
    })

    test("throws for unsupported non-JSON types (function)", () => {
        const obj = { a: () => {} }
        expect(() => canonicalJSONStringify(obj)).toThrow(
            "Non-JSON value encountered: function",
        )
    })

    test("throws for unsupported non-JSON types (BigInt)", () => {
        const obj = { a: BigInt(1) }
        expect(() => canonicalJSONStringify(obj)).toThrow(
            "Non-JSON value encountered: bigint",
        )
    })

    test("throws for unsupported non-JSON types (Symbol)", () => {
        const obj = { a: Symbol("test") }
        expect(() => canonicalJSONStringify(obj)).toThrow(
            "Non-JSON value encountered: symbol",
        )
    })
})

describe("validatePureJson", () => {
    test("allows pure JSON objects", () => {
        const obj = { a: 1, b: "hello", c: true, d: null, e: [1, { f: false }] }
        expect(() => validatePureJson(obj)).not.toThrow()
    })

    test("allows pure JSON arrays", () => {
        const arr = [1, "hello", { a: true }, null]
        expect(() => validatePureJson(arr)).not.toThrow()
    })

    test("allows primitive values", () => {
        expect(() => validatePureJson(null)).not.toThrow()
        expect(() => validatePureJson(true)).not.toThrow()
        expect(() => validatePureJson(123)).not.toThrow()
        expect(() => validatePureJson("hello")).not.toThrow()
    })

    test("throws for circular references", () => {
        const obj: any = {}
        obj.a = obj
        expect(() => validatePureJson(obj)).toThrow(
            "Circular reference detected in JSON payload",
        )
    })

    test("throws for non-plain objects (Date)", () => {
        const obj = { date: new Date() }
        expect(() => canonicalJSONStringify(obj)).toThrow(
            /Only plain objects are supported. Found prototype: Date/,
        )
    })

    test("throws for non-plain objects (class instance)", () => {
        class MyClass {}
        const obj = { instance: new MyClass() }
        expect(() => validatePureJson(obj)).toThrow(
            /Only plain objects are supported. Found prototype: MyClass/,
        )
    })

    test("throws for unsupported primitive types (undefined)", () => {
        const obj = { a: undefined }
        expect(() => validatePureJson(obj)).toThrow(
            "Non-JSON value encountered: undefined",
        )
    })

    test("throws for unsupported primitive types (function)", () => {
        const obj = { a: () => {} }
        expect(() => validatePureJson(obj)).toThrow(
            "Non-JSON value encountered: function",
        )
    })

    test("throws for unsupported primitive types (BigInt)", () => {
        const obj = { a: BigInt(1) }
        expect(() => validatePureJson(obj)).toThrow(
            "Non-JSON value encountered: bigint",
        )
    })
})

describe("looksLikeJsonString", () => {
    test("identifies JSON-like strings", () => {
        expect(looksLikeJsonString('{"key": "value"}')).toBe(true)
        expect(looksLikeJsonString("[1, 2, 3]")).toBe(true)
        expect(looksLikeJsonString('  {"nested": {"key": "value"}}  ')).toBe(
            true,
        )
    })

    test("rejects non-JSON-like strings", () => {
        expect(looksLikeJsonString("hello world")).toBe(false)
        expect(looksLikeJsonString("")).toBe(false)
        expect(looksLikeJsonString('{"incomplete')).toBe(false)
        expect(looksLikeJsonString('incomplete"}')).toBe(false)
    })
})
