import { demosClaimRefForAddress, type ClaimReference } from "@/identity/cci"
import { Demos, DemosWebAuth } from "@/websdk"

/** Create a fresh connected Demos wallet and its canonical primary claim. */
export async function newConnectedDemos(): Promise<{
    demos: Demos
    claim: ClaimReference
}> {
    const auth = new DemosWebAuth()
    await auth.create()
    const demos = new Demos()
    await demos.connectWallet(auth.keypair.privateKey as Uint8Array)
    return {
        demos,
        claim: demosClaimRefForAddress(await demos.getEd25519Address()),
    }
}
