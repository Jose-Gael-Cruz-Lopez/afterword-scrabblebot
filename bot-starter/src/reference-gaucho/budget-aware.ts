/** Experimental receding confidence model: scarce funds reduce the assumed
 * probability of completing speculative words, and lower the cashout target.
 * Uses our bankroll and public paid prices; no hidden racks or live bids.
 */
import type { BidContext } from '../strategy.js';
import { LastTileDenial, type LastTilePolicy } from '../last-tile-denial.js';
import { GauchoReference } from './adapter.js';
import { ExactTerminalStrategy } from './terminal-exact.js';

export interface BudgetAwareOptions { reservePurchases?: number; minimumConfidence?: number }
export class BudgetAwareStrategy implements LastTilePolicy {
  private initialRack?: ReadonlyMap<string, number>;
  private readonly policies = new Map<number, LastTilePolicy>();
  constructor(readonly words: readonly string[], readonly options: BudgetAwareOptions = {}) {}
  private context(ctx: BidContext): BidContext {
    this.initialRack ??= new Map(ctx.initialRack ?? ctx.myRack);
    return { ...ctx, initialRack: ctx.initialRack ?? this.initialRack };
  }
  private policy(ctx: BidContext): LastTilePolicy {
    const prices = (ctx.history ?? []).slice(-20).map(h => h.paid).filter(p => p > 1).sort((a, b) => a - b);
    const price = prices.length >= 4 ? prices[Math.floor(prices.length / 2)]! : 13;
    const reserve = Math.max(1, this.options.reservePurchases ?? 3) * Math.max(2, Math.min(30, price));
    const confidence = (ctx.roundsRemaining ?? 60) <= 2 ? 1 : Math.max(this.options.minimumConfidence ?? .55,
      Math.min(1, Math.round(20 * Math.sqrt(Math.max(0, ctx.myBalance) / reserve)) / 20));
    let p = this.policies.get(confidence);
    if (!p) {
      const reference = new GauchoReference(this.words, { name: 'Afterword', terminalSafe: true,
        overrides: { pBase: .95 * confidence, minPlayReward: 40.551 * confidence } });
      p = new LastTileDenial(new ExactTerminalStrategy(reference));
      this.policies.set(confidence, p);
    }
    return p;
  }
  word(ctx: BidContext): string | null { const c = this.context(ctx); return this.policy(c).word(c); }
  bid(ctx: BidContext): number { const c = this.context(ctx); return this.policy(c).bid(c); }
}
