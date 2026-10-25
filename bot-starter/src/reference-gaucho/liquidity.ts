/** Experimental: recycle a mature word only after an observed liquidity stall. */
import type { PlanningContext } from '../strategy.js';
import { GauchoReference, type GauchoOptions } from './adapter.js';
import { bestWord } from './core/dict.js';
import { rackFromMap } from './core/rules.js';

export interface LiquidityOptions extends GauchoOptions {
  stallRounds?: number;
  minimumReward?: number;
  maximumBalance?: number;
  minimumHorizon?: number;
}

export class LiquidityStrategy {
  readonly name: string;
  private readonly reference: GauchoReference;
  constructor(words: readonly string[], private readonly options: LiquidityOptions = {}) {
    this.name = options.name ?? 'Afterword liquidity candidate';
    this.reference = new GauchoReference(words, { ...options, name: this.name, terminalSafe: true });
  }
  bid(ctx: PlanningContext): number { return this.reference.bid(ctx); }
  word(ctx: PlanningContext & { seat?: number }): string | null {
    const normal = this.reference.word(ctx);
    if (normal) return normal;
    const cash = ctx.myBalance ?? 100;
    if (cash > (this.options.maximumBalance ?? 20) || (ctx.roundsRemaining ?? 0) < (this.options.minimumHorizon ?? 8)) return null;
    const seat = ctx.seat ?? ctx.players?.findIndex(p => p.name === this.name || p.name === 'Afterword');
    if (seat === undefined || seat < 0 || !ctx.round || !ctx.history?.length) return null;
    const lastWin = [...ctx.history].reverse().find(h => h.winner === seat)?.round ?? 0;
    if (ctx.round - lastWin < (this.options.stallRounds ?? 6)) return null;
    const prices = ctx.history.slice(-8).map(h => h.paid).filter(n => n > 0).sort((a, b) => a - b);
    if (prices.length < 4 || cash >= prices[Math.floor(prices.length / 2)]!) return null;
    const k = bestWord(this.reference.dictionary, rackFromMap(ctx.myRack), 7);
    return k >= 0 && this.reference.dictionary.rew[k]! >= (this.options.minimumReward ?? 24)
      ? this.reference.dictionary.words[k]! : null;
  }
}
