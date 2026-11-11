/**
 * L2PS settlement v1, client side: the commitment and signature a transfer
 * carries so that validators outside the subnet can apply its balance change
 * against a proof, without seeing the receiver or the amount.
 *
 * Must stay byte-for-byte identical to the node's
 * `src/libs/l2ps/settlement/encoding.ts` (spec: node
 * `docs/design/l2ps-zk-settlement.md`, "Interface v1"). The shared vectors in
 * `src/tests/l2ps/fixtures/settlementVectors.json` pin both sides.
 */
import { poseidon8 } from "poseidon-lite"
import { randomBytes } from "@noble/hashes/utils"

import type { Transaction } from "@/types"
import type {
    L2PSInnerSendPayload,
    L2PSTransferSettlement,
} from "@/types/blockchain/TransactionSubtypes/L2PSTransaction"
import type { Demos } from "@/websdk/demosclass"
import { demToOs, parseOsString } from "@/denomination/conversion"
import { OS_PER_DEM } from "@/denomination"
import { resolveNonce } from "@/utils"

export const L2PS_SETTLEMENT_VERSION = 1
export const L2PS_SETTLEMENT_SIGNATURE_DOMAIN = "l2ps-settlement:v1:"
/** Amounts, fees, balances and net change magnitudes stay below this. */
export const L2PS_SETTLEMENT_AMOUNT_LIMIT = 1n << 128n
export const L2PS_SETTLEMENT_NONCE_LIMIT = 1n << 64n
/** 31 bytes keeps the salt below the BN254 field modulus. */
export const L2PS_SETTLEMENT_SALT_BYTES = 31

const ACCOUNT = /^0x[0-9a-f]{64}$/
const FIELD_HEX = /^0x[0-9a-f]{64}$/

export interface L2PSSettlementOpening {
    /** Sender account, `0x` + 64 lowercase hex. */
    from: string
    /** Receiver account, `0x` + 64 lowercase hex. */
    to: string
    /** OS. */
    amount: bigint
    /** OS. */
    fee: bigint
    /** The sender's L1 nonce this transfer spends. */
    nonce: bigint
    salt: bigint
}

/** A 32-byte account does not fit one BN254 element: two 128-bit limbs. */
export function l2psAccountLimbs(account: string): [bigint, bigint] {
    if (!ACCOUNT.test(account)) {
        throw new Error(`not a canonical account: ${account}`)
    }
    return [
        BigInt("0x" + account.slice(2, 34)),
        BigInt("0x" + account.slice(34, 66)),
    ]
}

export function l2psFieldToHex(x: bigint): string {
    return "0x" + x.toString(16).padStart(64, "0")
}

export function l2psHexToField(hex: string): bigint {
    if (!FIELD_HEX.test(hex)) {
        throw new Error(`not a 32-byte hex field element: ${hex}`)
    }
    return BigInt(hex)
}

/** c = Poseidon(from_hi, from_lo, to_hi, to_lo, amount, fee, nonce, salt) */
export function l2psSettlementCommitment(o: L2PSSettlementOpening): bigint {
    if (o.amount < 0n || o.amount >= L2PS_SETTLEMENT_AMOUNT_LIMIT) {
        throw new Error("amount is out of range")
    }
    if (o.fee < 0n || o.fee >= L2PS_SETTLEMENT_AMOUNT_LIMIT) {
        throw new Error("fee is out of range")
    }
    if (o.nonce < 0n || o.nonce >= L2PS_SETTLEMENT_NONCE_LIMIT) {
        throw new Error("nonce is out of range")
    }
    if (o.salt < 0n || o.salt >= 1n << BigInt(8 * L2PS_SETTLEMENT_SALT_BYTES)) {
        throw new Error("salt is out of range")
    }
    const [fromHi, fromLo] = l2psAccountLimbs(o.from)
    const [toHi, toLo] = l2psAccountLimbs(o.to)
    return poseidon8([fromHi, fromLo, toHi, toLo, o.amount, o.fee, o.nonce, o.salt])
}

/**
 * What the sender signs with their account key:
 * `l2ps-settlement:v1:<chainId>:<l2psUid>:<c as 0x + 64 hex>`.
 */
export function l2psSettlementMessage(
    chainId: number,
    l2psUid: string,
    commitment: bigint,
): Uint8Array {
    if (!Number.isSafeInteger(chainId) || chainId < 0) {
        throw new Error(`invalid chain id ${chainId}`)
    }
    assertL2psUid(l2psUid)
    return new TextEncoder().encode(
        `${L2PS_SETTLEMENT_SIGNATURE_DOMAIN}${chainId}:${l2psUid}:${l2psFieldToHex(commitment)}`,
    )
}

function assertL2psUid(l2psUid: string): void {
    // A colon in the uid would let one message parse as another subnet's.
    if (typeof l2psUid !== "string" || l2psUid.length === 0 || l2psUid.includes(":")) {
        throw new Error("invalid L2PS uid")
    }
}

/** Fresh salt from the platform CSPRNG. */
export function l2psSettlementSalt(): bigint {
    const bytes = randomBytes(L2PS_SETTLEMENT_SALT_BYTES)
    let salt = 0n
    for (const b of bytes) salt = (salt << 8n) | BigInt(b)
    return salt
}

export interface SettledL2PSTransferOptions {
    /** Receiver account. */
    to: string
    /** OS. */
    amount: bigint
    l2psUid: string
    /**
     * OS. Defaults to the fee the SDK stamps on a native send for the
     * connected node; a lower fee is refused here, as settlement would.
     */
    fee?: bigint
    /** Defaults to the sender's next L1 nonce (or the auto-nonce reservation). */
    nonce?: number
    /** Defaults to the chain id the connected node reports. */
    chainId?: number
    /**
     * `false` builds the pre-settlement transfer (no commitment, legacy
     * fee and amount handling) for networks without the settlement fork.
     */
    settle?: boolean
}

/**
 * Build and sign the inner native send of an L2PS transfer, ready for
 * `L2PS.encryptTx`. With settlement (the default) `data[1].settlement`
 * carries the fee, salt, commitment and the sender's signature over the
 * settlement message, and `content.nonce` is the nonce the commitment binds.
 */
export async function buildSettledL2PSTransfer(
    demos: Demos,
    options: SettledL2PSTransferOptions,
): Promise<Transaction> {
    if (!demos.keypair) throw new Error("Wallet not connected")
    const settle = options.settle !== false
    // The commitment is signed with ed25519 and binds `content.from`, so both
    // must name the same key.
    if (settle && demos.algorithm !== "ed25519") {
        throw new Error("L2PS settlement needs an ed25519 wallet")
    }

    const from = (await demos.getEd25519Address()).toLowerCase()
    const to = normalizeAccount(options.to)
    const amount = options.amount
    if (typeof amount !== "bigint" || amount < 0n || amount >= L2PS_SETTLEMENT_AMOUNT_LIMIT) {
        throw new Error("amount must be an OS bigint in [0, 2^128)")
    }
    if (options.fee !== undefined && (options.fee < 0n || options.fee >= L2PS_SETTLEMENT_AMOUNT_LIMIT)) {
        throw new Error("fee must be an OS bigint in [0, 2^128)")
    }
    assertL2psUid(options.l2psUid)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internals = demos as any
    const isPostFork: boolean = await internals._isPostForkCached()
    // The commitment opens on the OS amount the members decrypt; a pre-fork
    // DEM number would not recompute to it.
    if (settle && !isPostFork) {
        throw new Error("L2PS settlement needs a node past the osDenomination fork")
    }
    await internals._assertAmountAcceptableOnTargetNode(amount)

    const nonce = await resolveNonce(
        options.nonce,
        () => demos.getAddressNonce(from),
        demos._nonceReserver(from),
    )

    const tx = await demos.tx.prepare()
    tx.content.type = "native"
    tx.content.to = to
    tx.content.nonce = nonce
    tx.content.amount = amount as unknown as number
    tx.content.timestamp = Date.now()
    const payload: L2PSInnerSendPayload = {
        nativeOperation: "send",
        // The serializer does not walk `data`, so the wire shape goes in here.
        args: [to, isPostFork ? amount.toString() : Number(amount / OS_PER_DEM)],
        l2ps_uid: options.l2psUid,
    }
    tx.content.data = ["native", payload] as unknown as Transaction["content"]["data"]

    if (!settle) return demos.sign(tx)

    const chainId = options.chainId ?? (await demos.getNetworkInfo())?.chainId
    if (typeof chainId !== "number") {
        throw new Error("the node reports no chain id; pass options.chainId")
    }
    // Settlement refuses a fee below the native transfer fee, so a given fee
    // is checked against it too, not only the default.
    const nativeFee = await nativeTransferFee(demos, tx)
    const fee: bigint = options.fee ?? nativeFee
    if (fee < nativeFee) {
        throw new Error(`fee ${fee} is below the native transfer fee ${nativeFee}`)
    }
    const salt = l2psSettlementSalt()
    const commitment = l2psSettlementCommitment({
        from,
        to,
        amount,
        fee,
        nonce: BigInt(nonce),
        salt,
    })
    const message = l2psSettlementMessage(chainId, options.l2psUid, commitment)
    const signature = await demos.signMessage(new TextDecoder().decode(message), {
        algorithm: "ed25519",
    })
    const settlement: L2PSTransferSettlement = {
        fee: fee.toString(),
        salt: l2psFieldToHex(salt),
        commitment: l2psFieldToHex(commitment),
        signature: signature.data,
    }
    payload.settlement = settlement

    const signed = await demos.sign(tx)
    // sign() re-reads the node's fee parameters; if they moved since the
    // probe, a default fee no longer matches what the send pays, and a given
    // fee may have fallen below the floor.
    const stamped = stampedFee(signed)
    if (options.fee === undefined ? stamped !== nativeFee : stamped > fee) {
        throw new Error("the node's fee changed while building the transfer; retry")
    }
    return signed
}

function normalizeAccount(address: string): string {
    const hex = /^0x/i.test(address) ? address.slice(2) : address
    const account = "0x" + hex.toLowerCase()
    if (!ACCOUNT.test(account)) throw new Error(`Invalid To address: ${address}`)
    return account
}

/** The fee sign() stamps on this native send: the node's or the derived one. */
async function nativeTransferFee(demos: Demos, tx: Transaction): Promise<bigint> {
    return stampedFee(await demos.sign(structuredClone(tx)))
}

function stampedFee(tx: Transaction): bigint {
    const fee = tx.content.transaction_fee
    if (!fee) return 0n
    return [fee.network_fee, fee.rpc_fee, fee.additional_fee].reduce<bigint>(
        (sum, v) => sum + toOs(v as number | string | undefined),
        0n,
    )
}

function toOs(value: number | string | undefined): bigint {
    if (typeof value === "string") return parseOsString(value)
    if (typeof value === "number" && Number.isFinite(value)) return demToOs(value)
    return 0n
}
