/**
 * tlsn-wasm 0.1.0-alpha.12 refers to JsonValue in its public declaration but
 * does not declare it. Keep the compatibility type scoped to that module so
 * strict consumers do not need to add an application-global shim.
 */
export {}

declare module "tlsn-wasm" {
    export type JsonValue =
        | null
        | boolean
        | number
        | string
        | JsonValue[]
        | { [key: string]: JsonValue }
}
