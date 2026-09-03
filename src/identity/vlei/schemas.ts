/**
 * vLEI schema SAIDs — pinned from an authoritative source (the GLEIF vLEI
 * schema server), NEVER accepted from the presenter. These are the ground-truth
 * identifiers the verifier's chain walk checks each credential's `sad.s`
 * against.
 */
export const VLEI_SCHEMAS = {
    QVI: "EBfdlu8R27Fbx-ehrqwImnK-8Cm79sqbAQ4MmvEAYqao",
    LE: "ENPXp1vQzRF6JwIuS-mp2U8Uf1MoADoP_GqQ62VsDZWY",
    ECR_AUTH: "EH6ekLjSr8V32WyFbGe1zXjTzFs9PkTYmupJ9H65O14g", // NOSONAR — public GLEIF schema SAID (content hash), not a secret
    ECR: "EEy9PkikFcANV1l7EHukCeXqrzT1hNZjGlUk7wuMO5jw",
    OOR_AUTH: "EKA57bKBKxr_kN7iN5i7lMUxpMG-s19dRcmov1iDxz-E", // NOSONAR — public GLEIF schema SAID (content hash), not a secret
    OOR: "EBNaNu-M9P5cgrnfl2Fvymy4E_jvxxyjb70PRtiANlJy",
} as const

/**
 * The purpose-built agent-authority ACDC — NOT a vLEI, chained by edge `le` to
 * the LE vLEI credential (Flow 1) or edge `ecr` to an officer's ECR (Flow 2).
 * This SAID is the two-edge-variant schema; re-pin here if the schema changes.
 */
export const AGENT_AUTHORITY_SCHEMA = "ENJwDd-GDzR8ByUPQZ8jQRbAwz4NfoGHbaEZUzdezIA2"

/** All schemas the verifier recognises (vLEI + agent-authority). */
export const ALL_SCHEMAS = {
    ...VLEI_SCHEMAS,
    AGENT_AUTHORITY: AGENT_AUTHORITY_SCHEMA,
} as const

export type VleiSchemaName = keyof typeof VLEI_SCHEMAS
export type SchemaName = keyof typeof ALL_SCHEMAS

/** SAID → human name, for verdict readability. */
export const SCHEMA_NAME_BY_SAID: Record<string, SchemaName> = Object.fromEntries(
    Object.entries(ALL_SCHEMAS).map(([name, said]) => [said, name as SchemaName]),
)

/**
 * Edge topology of the vLEI trust chain, keyed by a credential's schema. `edges`
 * lists the ACCEPTED parent edges — a credential must carry exactly one of them
 * (`sad.e.<name>.n` → parent SAID), and that parent's schema must be in the
 * edge's `parentSchemas`. A chain root (QVI) has no parent edge — its issuer must
 * instead be the pinned GLEIF root AID.
 */
export interface EdgeRule {
    name: string
    parentSchemas: SchemaName[]
}
export interface ChainRule {
    /** Accepted parent edges; the credential must carry exactly one. */
    edges?: EdgeRule[]
    /** True when this credential sits at the GLEIF root (issuer = trusted root AID). */
    isRoot?: boolean
    /** True for the agent-authority ACDC: issuee is a delegated agent AID. */
    isAgentAuthority?: boolean
}

export const CHAIN_RULES: Record<SchemaName, ChainRule> = {
    QVI: { isRoot: true },
    LE: { edges: [{ name: "qvi", parentSchemas: ["QVI"] }] },
    ECR: {
        edges: [
            { name: "le", parentSchemas: ["LE"] },
            { name: "auth", parentSchemas: ["ECR_AUTH"] },
        ],
    },
    ECR_AUTH: { edges: [{ name: "le", parentSchemas: ["LE"] }] },
    OOR: { edges: [{ name: "auth", parentSchemas: ["OOR_AUTH"] }] },
    OOR_AUTH: { edges: [{ name: "le", parentSchemas: ["LE"] }] },
    AGENT_AUTHORITY: {
        isAgentAuthority: true,
        edges: [
            { name: "le", parentSchemas: ["LE"] }, // Flow 1: entity grants directly
            { name: "ecr", parentSchemas: ["ECR"] }, // Flow 2: via accountable officer's ECR
        ],
    },
}
