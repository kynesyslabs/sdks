/**
 * Demos vLEI verifier — walks a KERI/ACDC credential chain to a pinned GLEIF
 * root and emits a signed-able verdict. Reads credentials + key states through
 * an injected `VleiCredentialSource` so the SDK takes no KERI-client dependency.
 *
 *   Step 1/2  key-state retrieval + digest per AID; for an agent-authority leaf,
 *             the delegated agent AID's delegation seal (`di` = delegator) is checked
 *   Step 3    ACDC chain walk: schema-SAID pin + edge topology back to the root
 *   Step 4    TEL revocation per credential, time-of-use, FAIL-CLOSED
 *   Step 5    verdict + recordDigest, plus (optional) authorityScope evaluation
 *
 * The verifier trusts nothing from the presenter: schema SAIDs are pinned
 * (`schemas.ts`) and the chain root must be issued by `trustedRootAid`.
 */
import { CHAIN_RULES, SCHEMA_NAME_BY_SAID } from "./schemas"
import { canonicalDigest } from "./canonical"
import type {
    ChainNode,
    DelegationCheck,
    KeyControlProof,
    ProposedTx,
    VleiCredentialSource,
    VleiKeyState,
    VleiVerdict,
} from "./types"

/** sha256 over the canonical proposed transaction — the value a proof binds to. */
export function txDigest(tx: ProposedTx): string {
    return canonicalDigest(tx)
}

function normalizeKeyState(ks: VleiKeyState | VleiKeyState[] | undefined): VleiKeyState | undefined {
    if (!ks) return undefined
    return Array.isArray(ks) ? ks[0] : ks
}

async function keyState(
    source: VleiCredentialSource,
    pre: string,
): Promise<VleiKeyState | undefined> {
    try {
        return normalizeKeyState(await source.getKeyState(pre))
    } catch {
        return undefined
    }
}

function keyStateDigest(state: VleiKeyState | undefined): string {
    if (!state) return ""
    return state.d ?? canonicalDigest({ i: state.i, s: state.s, k: state.k })
}

function evaluateScope(scope: any, tx: ProposedTx): string[] {
    const reasons: string[] = []
    if (!scope) {
        reasons.push("credential carries no authorityScope")
        return reasons
    }
    if (Array.isArray(scope.transactionTypes) && !scope.transactionTypes.includes(tx.type)) {
        reasons.push(`transaction type '${tx.type}' not in authorised types`)
    }
    if (tx.corridor && Array.isArray(scope.corridors) && !scope.corridors.includes(tx.corridor)) {
        reasons.push(`corridor '${tx.corridor}' not permitted`)
    }
    if (tx.network && Array.isArray(scope.relyingNetworks) && !scope.relyingNetworks.includes(tx.network)) {
        reasons.push(`network '${tx.network}' not a relying network`)
    }
    if (tx.amount && scope.perTransactionLimit) {
        const lim = scope.perTransactionLimit
        if (tx.currency && lim.currency && tx.currency !== lim.currency) {
            reasons.push(`currency ${tx.currency} != per-transaction limit currency ${lim.currency}`)
        } else if (Number(tx.amount) > Number(lim.amount)) {
            reasons.push(`amount ${tx.amount} exceeds per-transaction limit ${lim.amount} ${lim.currency}`)
        }
    }
    return reasons
}

export interface VerifyChainOpts {
    proposedTx?: ProposedTx
    keyControl?: KeyControlProof
    /** ISO timestamp for the verdict; defaults to `new Date().toISOString()`. */
    timestamp?: string
}

export async function verifyChain(
    source: VleiCredentialSource,
    leafSaid: string,
    trustedRootAid: string,
    opts: VerifyChainOpts = {},
): Promise<VleiVerdict> {
    const reasons: string[] = []
    const chain: ChainNode[] = []
    const keyStateDigests: Record<string, string> = {}
    const bySaid = new Map<string, ChainNode>()

    const visited = new Set<string>()
    const queue: string[] = [leafSaid]

    while (queue.length) {
        const said = queue.shift()!
        if (visited.has(said)) continue
        visited.add(said)

        let cred: Awaited<ReturnType<VleiCredentialSource["getCredential"]>>
        try {
            cred = await source.getCredential(said)
        } catch {
            reasons.push(`unresolvable credential ${said} (fail-closed)`)
            continue
        }

        const schema = cred.sad.s
        const schemaName = SCHEMA_NAME_BY_SAID[schema]
        const node: ChainNode = {
            said,
            schema,
            schemaName,
            issuer: cred.sad.i,
            issuee: cred.sad.a?.i,
            status: cred.status?.s,
            attributes: cred.sad.a,
        }

        // Step 4 — revocation, time-of-use, fail closed on anything but issued.
        if (node.status !== "0") {
            reasons.push(`credential ${schemaName ?? schema} status=${node.status ?? "unknown"} (not issued)`)
        }

        // Step 3 — schema SAID must be pinned.
        if (!schemaName) {
            reasons.push(`unpinned/unknown schema ${schema} on ${said}`)
        } else {
            const rule = CHAIN_RULES[schemaName]
            if (rule.isRoot) {
                if (node.issuer !== trustedRootAid) {
                    reasons.push(
                        `${schemaName} root issuer ${node.issuer} != trusted GLEIF root ${trustedRootAid}`,
                    )
                }
            } else {
                // pick the one accepted parent edge the credential actually carries
                const used = (rule.edges ?? []).find(e => cred.sad.e?.[e.name]?.n)
                if (!used) {
                    const names = (rule.edges ?? []).map(e => `'${e.name}'`).join(" | ")
                    reasons.push(`${schemaName} missing a parent edge (${names})`)
                } else {
                    node.edgeName = used.name
                    node.edgeTo = cred.sad.e![used.name].n
                    queue.push(node.edgeTo!)
                }
            }
        }

        // Step 1/2 — key-state digest for the issuer AID (auditable).
        if (!(node.issuer in keyStateDigests)) {
            keyStateDigests[node.issuer] = keyStateDigest(await keyState(source, node.issuer))
        }

        chain.push(node)
        bySaid.set(said, node)
    }

    // Step 3 (cont.) — edge targets must be present and schema-consistent.
    for (const node of chain) {
        if (!node.schemaName || !node.edgeTo || !node.edgeName) continue
        const edgeRule = CHAIN_RULES[node.schemaName].edges?.find(e => e.name === node.edgeName)
        const parent = bySaid.get(node.edgeTo)
        if (!parent) {
            reasons.push(`${node.schemaName} edge target ${node.edgeTo} not in presented chain`)
            continue
        }
        if (edgeRule && (!parent.schemaName || !edgeRule.parentSchemas.includes(parent.schemaName))) {
            reasons.push(
                `${node.schemaName} edge '${node.edgeName}' parent schema ${parent.schemaName ?? parent.schema} not in {${edgeRule.parentSchemas.join(",")}}`,
            )
        }
    }

    // Step 2 (full) — delegated agent AID for an agent-authority credential.
    let delegation: DelegationCheck | undefined
    const aaNode = chain.find(n => n.schemaName && CHAIN_RULES[n.schemaName].isAgentAuthority)
    const accountableOfficer = aaNode?.attributes?.accountableOfficer as string | undefined
    if (aaNode && aaNode.issuee) {
        const ks = await keyState(source, aaNode.issuee)
        keyStateDigests[aaNode.issuee] = keyStateDigest(ks)
        const di = ks?.di
        const ok = !!di && di === aaNode.issuer
        delegation = { agentAid: aaNode.issuee, delegator: di, expectedDelegator: aaNode.issuer, ok }
        if (!ok) {
            reasons.push(
                `agent AID ${aaNode.issuee} is not delegated by the issuing entity ${aaNode.issuer} (di=${di ?? "none"})`,
            )
        }
    }

    // Step 5 (optional) — evaluate the proposed transaction against authorityScope.
    let scope: VleiVerdict["scope"]
    if (opts.proposedTx) {
        const scopeReasons = aaNode
            ? evaluateScope(aaNode.attributes?.authorityScope, opts.proposedTx)
            : ["no agent-authority credential in chain to evaluate scope against"]
        scope = { tx: opts.proposedTx, ok: scopeReasons.length === 0, reasons: scopeReasons }
        reasons.push(...scopeReasons)
    }

    // Step 0 (replay protection) — live control of the agent's key over a fresh
    // challenge, bound to THIS transaction.
    let keyControl: VleiVerdict["keyControl"]
    if (opts.keyControl) {
        const kc = opts.keyControl
        const boundToTx = opts.proposedTx ? kc.boundTxDigest === txDigest(opts.proposedTx) : true
        keyControl = { ...kc, boundToTx }
        if (!kc.ok) {
            reasons.push(`agent key-control challenge not satisfied${kc.reason ? `: ${kc.reason}` : ""}`)
        }
        if (!boundToTx) {
            reasons.push("key-control proof not bound to this transaction (replay/mismatch)")
        }
        if (aaNode?.issuee && kc.agentAid !== aaNode.issuee) {
            reasons.push(`key-control proof is for ${kc.agentAid}, not the authorised agent ${aaNode.issuee}`)
        }
    }

    const reachedRoot = chain.some(
        n => n.schemaName && CHAIN_RULES[n.schemaName].isRoot && n.issuer === trustedRootAid,
    )
    if (!reachedRoot) reasons.push("chain does not terminate at the trusted GLEIF root")

    const timestamp = opts.timestamp ?? new Date().toISOString()
    const record = stripUndefinedDeep({
        leaf: leafSaid,
        chain,
        keyStateDigests,
        delegation,
        accountableOfficer,
        scope,
        keyControl,
        trustedRootAid,
        timestamp,
    })
    const recordDigest = canonicalDigest(record)

    return {
        leaf: leafSaid,
        ok: reasons.length === 0 && reachedRoot,
        reachedRoot,
        reasons,
        chain,
        keyStateDigests,
        delegation,
        accountableOfficer,
        scope,
        keyControl,
        timestamp,
        recordDigest,
    }
}

/**
 * Recursively drop undefined-valued keys so the strict canonical serializer
 * (which throws on `undefined` anywhere in the graph) accepts the record. The
 * chain nodes carry optional fields (issuee/status/edgeTo/…) that are often
 * undefined; those keys are simply omitted from the digested form.
 */
function stripUndefinedDeep<T>(value: T): T {
    if (Array.isArray(value)) return value.map(v => stripUndefinedDeep(v)) as unknown as T
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (v === undefined) continue
            out[k] = stripUndefinedDeep(v)
        }
        return out as T
    }
    return value
}
