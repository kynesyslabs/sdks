import { DemosWebAuth } from "../../../websdk/DemosWebAuth"

declare const auth: DemosWebAuth
declare const maybeSeed: string | undefined

auth.create(maybeSeed)
auth.create(undefined)
const args: Parameters<DemosWebAuth["create"]> = []
const seeded = auth.create("phrase")

export { args, seeded }
