/** NOTE
 * The finders should use public RPCs with failover mechanisms through the Providers singleton getter.
 * The getter is automatically initialized, updated and imported in the exported finders.
 * This is to ensure that the finders don't get rate limited or go offline.
 * This also means that the SDK calls should be made locally (using the ip address of the user).
 */

import EvmCoinFinder from "./EvmCoinFinder";
import CoinFinder from "./CoinFinder";

export { EvmCoinFinder, CoinFinder };
