/** Optional win-oriented policy wrapper. No network or opponent-private data.
 * Currency remaining after the last usable auction has no scoring value. Bid
 * the whole balance there, even if our own rack gains nothing, to deny another
 * player's final completion. Approximate terminal word solvers can violate
 * score monotonicity when receiving an extra tile; benchmark before adoption.
 */
import type { BidContext } from './strategy.js';
export interface LastTilePolicy {
  word(context: BidContext): string | null;
  bid(context: BidContext): number;
}
export class LastTileDenial implements LastTilePolicy {
  constructor(readonly base: LastTilePolicy) {}
  word(context: BidContext): string | null { return this.base.word(context); }
  bid(context: BidContext): number {
    // An exact terminal wrapper may prime its feasible pre-purchase plan here.
    // Always call it even when the returned amount will be replaced.
    const original = this.base.bid(context);
    if (context.roundsRemaining !== 2) return original;
    return Number.isFinite(context.myBalance) ? Math.max(0, Math.floor(context.myBalance)) : 0;
  }
}
