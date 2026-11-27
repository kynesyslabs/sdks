import type { Demos } from "@demosnetwork/demos-native";

declare const publicKey: Awaited<ReturnType<Demos["crypto"]["getIdentity"]>>["publicKey"];
const hex: string = publicKey.toString("hex");
// @ts-expect-error Buffer does not accept arbitrary encodings (and must not become any).
publicKey.toString("not-an-encoding");
