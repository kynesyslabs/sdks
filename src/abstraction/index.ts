/** NOTE
 * The finders should use public RPCs with failover mechanisms through the Providers singleton getter.
 * The getter is automatically initialized, updated and imported in the exported finders.
 * This is to ensure that the finders don't get rate limited or go offline.
 * This also means that the SDK calls should be made locally (using the ip address of the user).
 */

import { EvmCoinFinder } from "./EvmCoinFinder"
import { CoinFinder } from "./CoinFinder"
import { Identities } from "./Identities"
import {
    InferFromWritePayload,
    InferFromSignaturePayload,
    XMCoreTargetIdentityPayload,
    Web2CoreTargetIdentityPayload,
    InferFromGithubOAuthPayload,
    InferFromTwitterPayload,
    TwitterProof,
    IdentityPayload,
    InferFromSignatureTargetIdentityPayload,
    PqcIdentityAssignPayload,
    PqcIdentityRemovePayload,
    UDIdentityAssignPayload,
    UDIdentityRemovePayload,
    UserPoints,
    FindDemosIdByWeb2IdentityQuery,
    FindDemosIdByWeb3IdentityQuery,
    TelegramAttestationPayload,
    TelegramSignedAttestation,
    DiscordProof
} from "@/types/abstraction"

export {
    EvmCoinFinder,
    CoinFinder,
    Identities,
    InferFromWritePayload,
    InferFromSignaturePayload,
    XMCoreTargetIdentityPayload,
    Web2CoreTargetIdentityPayload,
    InferFromGithubOAuthPayload,
    InferFromTwitterPayload,
    TwitterProof,
    IdentityPayload,
    InferFromSignatureTargetIdentityPayload,
    PqcIdentityAssignPayload,
    PqcIdentityRemovePayload,
    UDIdentityAssignPayload,
    UDIdentityRemovePayload,
    UserPoints,
    FindDemosIdByWeb2IdentityQuery,
    FindDemosIdByWeb3IdentityQuery,
    TelegramAttestationPayload,
    TelegramSignedAttestation,
    DiscordProof
}
