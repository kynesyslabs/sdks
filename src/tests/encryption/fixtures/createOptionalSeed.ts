import { DemosWebAuth } from "../../../websdk/DemosWebAuth"

declare const auth: DemosWebAuth
declare const maybeSeed: string | undefined

const optionalCreate: (seed?: string) => ReturnType<DemosWebAuth["create"]> = auth.create
void optionalCreate(maybeSeed)
void optionalCreate(undefined)
const args: Parameters<DemosWebAuth["create"]> = []
const seeded = auth.create("phrase")

export { args, seeded }
