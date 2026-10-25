/** Experimental multiword cashflow: a collection of mature words can be worth
 * cashing even when no single word crosses the legacy forty-point threshold.
 */
import type { LastTilePolicy } from '../last-tile-denial.js';
import type { BidContext } from '../strategy.js';
import { GauchoReference } from './adapter.js';
import { exactTerminalPartition } from './terminal-exact.js';
import { rackFromMap } from './core/rules.js';

export class PackingCashflowStrategy implements LastTilePolicy {
  constructor(readonly base: LastTilePolicy, readonly reference: GauchoReference,
    readonly options = { maximumCash: 30, minimumPacking: 40, minimumWord: 16 }) {}
  bid(ctx: BidContext): number { return this.base.bid(ctx); }
  word(ctx: BidContext): string | null {
    const normal = this.base.word(ctx);
    if (normal || (ctx.roundsRemaining ?? 60) < 8 || ctx.myBalance > this.options.maximumCash) return normal;
    const d = this.reference.dictionary;
    const packing = exactTerminalPartition(d, rackFromMap(ctx.myRack), { timeBudgetMs: 12, maxNodes: 4000 });
    if (!packing || packing.words.length < 2 || packing.score < this.options.minimumPacking) return null;
    const hold = this.reference.potentialValue(ctx);
    let chosen: string | null = null, best = hold;
    for (const index of packing.words) {
      const credit = d.rew[index]!;
      if (credit < this.options.minimumWord) continue;
      const rest = new Map(ctx.myRack);
      for (let i = 0; i < 26; i++) {
        const n = d.counts[index * 26 + i]!;
        if (!n) continue;
        const letter = String.fromCharCode(65 + i), count = (rest.get(letter) ?? 0) - n;
        if (count) rest.set(letter, count); else rest.delete(letter);
      }
      const play = credit + this.reference.potentialValue(ctx, rest);
      if (play > best + .5) { best = play; chosen = d.words[index]!; }
    }
    return chosen;
  }
}
