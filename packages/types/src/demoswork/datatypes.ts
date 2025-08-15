export enum DataTypes {
    work = "$work",
    internal = "$internal",
    static = "$static",
}

export type operators =
    | "=="
    | "==="
    | ">"
    | ">="
    | "<"
    | "<="
    | "!="
    | "!=="
    | "in"
    | "not in"
    // boolean operators
    | "&&"
    | "||"
    | "not"
    | null