/** Experimental bankroll-aware final purchase. Public balances only; no bids
 * or private racks. Assumes rival last bids may reach their current balances.
 */
import type { LastTilePolicy } from '../last-tile-denial.js';
import type { BidContext } from '../strategy.js';
import type { Dict } from './core/dict.js';
import { rackFromMap } from './core/rules.js';
import { terminalCashoutFrontier, type ExactTerminalOptions } from './terminal-exact.js';
type FundedContext = BidContext & { seat?: number };

export class FundedTerminalStrategy implements LastTilePolicy {
  constructor(readonly base: LastTilePolicy, readonly dictionary: Dict, readonly options: ExactTerminalOptions = {}) {}
  bid(ctx: FundedContext): number { return this.base.bid(ctx); }
  word(ctx: FundedContext): string | null {
    if (ctx.roundsRemaining !== 2 || !ctx.players?.length) return this.base.word(ctx);
    const self = ctx.seat ?? ctx.players.findIndex(p => p.name === 'Afterword' || p.name === 'focal');
    if (self < 0) return this.base.word(ctx);
    const rivals = ctx.players.filter((p, i) => (p.seat ?? i) !== self);
    if (!rivals.length) return this.base.word(ctx);
    const balance = Math.max(0, ctx.myBalance ?? 0), highest = Math.max(...rivals.map(p => p.balance));
    if (balance > highest) return this.base.word(ctx);
    const frontier = terminalCashoutFrontier(this.dictionary, rackFromMap(ctx.myRack), (ctx.letter ?? '').charCodeAt(0) - 65, this.options);
    if (!frontier) return this.base.word(ctx);
    const probability = (cash: number): number => cash < highest ? 0 : cash > highest ? 1 : 1 / (1 + rivals.filter(p => p.balance === highest).length);
    const expected = (choice: typeof frontier[number]) => choice.loseScore + probability(balance + choice.credit) * (choice.winScore - choice.loseScore);
    const noSale = frontier[0]!, floor = expected(noSale);
    const best = frontier.reduce((a, b) => expected(b) > expected(a) ? b : a);
    return best.word && expected(best) >= floor + 1 ? best.word : this.base.word(ctx);
  }
}
