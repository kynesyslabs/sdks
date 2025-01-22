import { IDefaultChainWeb } from "../core";
import { NEAR as NearCore } from "../core/near";

// NOTE: The Near SDK for the web is the same as the core SDK, so we can just export the core SDK
export class NEAR extends NearCore implements IDefaultChainWeb {
}
