/** MIT-licensed Lionel/Gaucho reference, adapted from JoaquinGiorgis's policy.
 * This is an attributed competitive baseline, not an original Afterword policy.
 * See LICENSE, UPSTREAM.json and README.md for source and compatibility notes.
 */
import { chooseWords, decideBid, DEFAULT_PARAMS, type Params, type View } from './core/policy.js';
import { bestWord, spellableList, potential, type Dict } from './core/dict.js';
import { BAG, reward, VALUE, rackFromMap } from './core/rules.js';
import vickrey from './params/vickrey.json' with { type: 'json' };
import firstprice from './params/firstprice.json' with { type: 'json' };
import paidMarket from './params/market-paid.json' with { type: 'json' };
import type { PlanningContext } from '../strategy.js';
import type { SimContext, SimStrategy } from '../simulate.js';

export type GauchoContext = PlanningContext & { seat?: number; opponentRacks?: Int32Array[] };
export interface GauchoOptions { name?: string; overrides?: Partial<Params>; market?: number[][] | null; terminalSafe?: boolean }
const dictionaries = new WeakMap<readonly string[], Dict>();
/** The upstream typed-array dictionary layout, compiled from the caller's wordlist. */
export function compileDictionary(words: readonly string[]): Dict {
  const cached = dictionaries.get(words);
  if (cached) return cached;
  const scored = words.map(w => w.trim().toUpperCase()).filter(w => /^[A-Z]{2,}$/.test(w)).map(w => {
    let base = 0;
    for (const c of w) base += VALUE[c.charCodeAt(0) - 65]!;
    return { w, r: reward(base, w.length) };
  }).sort((a, b) => b.r - a.r || a.w.length - b.w.length);
  const n = scored.length;
  const d: Dict = { n, words: [], counts: new Uint8Array(n * 26), len: new Uint8Array(n), rew: new Uint16Array(n), mask: new Int32Array(n) };
  for (let k = 0; k < n; k++) {
    const { w, r } = scored[k]!;
    d.words[k] = w; d.len[k] = w.length; d.rew[k] = r;
    let mask = 0;
    for (const c of w) { const i = c.charCodeAt(0) - 65; d.counts[k * 26 + i]!++; mask |= 1 << i; }
    d.mask[k] = mask;
  }
  dictionaries.set(words, d);
  return d;
}
export class GauchoReference {
  readonly name: string;
  readonly dictionary: Dict;
  private initialRack?: Map<string, number>;
  private readonly secondPriceParams: Params;
  private readonly firstPriceParams: Params;
  private readonly market: number[][] | null;
  private readonly terminalSafe: boolean;
  constructor(dictionary: readonly string[], options: GauchoOptions = {}) {
    this.name = options.name ?? 'Lionel MIT reference';
    this.dictionary = compileDictionary(dictionary);
    this.secondPriceParams = { ...DEFAULT_PARAMS, ...vickrey, ...options.overrides };
    this.firstPriceParams = { ...DEFAULT_PARAMS, ...firstprice, ...options.overrides };
    this.market = options.market === undefined ? paidMarket : options.market;
    // Experimental correction remains opt-in until matched gameplay validation.
    this.terminalSafe = options.terminalSafe === true;
  }
  private state(ctx: GauchoContext): { p: Params; v: View } {
    this.initialRack ??= new Map(ctx.initialRack ?? ctx.myRack);
    const unseen = Int32Array.from(BAG);
    const remove = (c: string, n = 1) => {
      const i = c.charCodeAt(0) - 65;
      if (i >= 0 && i < 26) unseen[i] = Math.max(0, unseen[i]! - n);
    };
    for (const [c, n] of ctx.initialRack ?? this.initialRack) remove(c, n);
    for (const result of ctx.history ?? []) remove(result.letter);
    if (ctx.letter) remove(ctx.letter);
    const selfSeat = ctx.seat ?? ctx.players?.findIndex(p => p.name === this.name || p.name === 'Afterword');
    const won = selfSeat !== undefined && selfSeat >= 0 ? (ctx.history ?? []).filter(a => a.winner === selfSeat).length : undefined;
    const firstPrice = ctx.auctionType === 'FirstPrice';
    return {
      p: firstPrice ? this.firstPriceParams : this.secondPriceParams,
      v: { rack: rackFromMap(ctx.myRack), balance: ctx.myBalance ?? 100, unseen,
        auctionsLeft: Math.max(0, (ctx.roundsRemaining ?? 60) - 1), firstPrice,
        won, round: ctx.round ?? 1, market: this.market, opp: ctx.opponentRacks },
    };
  }
  bid(ctx: GauchoContext): number {
    const { p, v } = this.state(ctx);
    const letter = (ctx.letter ?? '').charCodeAt(0) - 65;
    return letter >= 0 && letter < 26 ? decideBid(this.dictionary, p, v, letter) : 0;
  }
  /** Expose the licensed policy's single-word heuristic for cashflow comparisons.
   * Uses the same horizon adjustment as its private opts() helper; no new data.
   */
  potentialValue(ctx: GauchoContext, rack: ReadonlyMap<string, number> = ctx.myRack): number {
    const { p, v } = this.state(ctx);
    let aHalf = p.aHalf;
    if (p.horizonW > 0) {
      const unseen = v.unseen.reduce((sum, n) => sum + n, 0);
      const fraction = unseen > 0 ? Math.min(1, Math.max(.02, v.auctionsLeft / unseen)) : 1;
      aHalf /= Math.pow(fraction, p.horizonW);
    }
    return potential(this.dictionary, rackFromMap(new Map(rack)), { unseen: v.unseen,
      maxMissing: Math.max(0, Math.min(p.maxMissing, v.auctionsLeft)), pBase: p.pBase, aHalf, minLen: p.minLen });
  }
  word(ctx: GauchoContext): string | null {
    const { p, v } = this.state(ctx);
    if (this.terminalSafe && ctx.roundsRemaining === 2) {
      const letter = (ctx.letter ?? '').charCodeAt(0) - 65;
      if (letter >= 0 && letter < 26) {
        const safe = this.safeTerminalCashout(v.rack, letter);
        if (safe) return safe;
      }
      // One usable purchase remains. The upstream flush trigger counts only
      // auctions *after* the current one, and can destroy a last-buy combination.
      if (v.balance > 0) return null;
      const k = bestWord(this.dictionary, v.rack);
      return k >= 0 ? this.dictionary.words[k]! : null;
    }
    return chooseWords(this.dictionary, p, v)[0] ?? null;
  }

  /**
   * Sell only a word independent of the optimal partition in both outcomes:
   * whether the last usable tile is lost or won. This independent exact search
   * certifies a sale; the upstream beam partition is not used as a proof.
   * Unfinished searches never certify a word.
   */
  private safeTerminalCashout(rack: Int32Array, letter: number): string | null {
    const d = this.dictionary, augmented = new Int32Array(rack);
    augmented[letter]!++;
    const deadline = performance.now() + 30;
    const expired = Symbol('terminal partition deadline');
    const seen = new Set<string>();
    const candidates = spellableList(d, augmented, d.n).flatMap(index => {
      const offset = index * 26, sparse: number[] = [];
      let face = 0;
      for (let i = 0; i < 26; i++) if (d.counts[offset + i]) {
        const n = d.counts[offset + i]!;
        sparse.push(i, n); face += n * VALUE[i]!;
      }
      const key = sparse.join(',');
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ index, sparse, face, score: d.rew[index]! }];
    });
    const fits = (word: typeof candidates[number], r: Int32Array): boolean => {
      for (let j = 0; j < word.sparse.length; j += 2) if (word.sparse[j + 1]! > r[word.sparse[j]!]!) return false;
      return true;
    };
    const change = (word: typeof candidates[number], r: Int32Array, sign: number) => {
      for (let j = 0; j < word.sparse.length; j += 2) r[word.sparse[j]!]! += sign * word.sparse[j + 1]!;
    };
    const memo = new Map<string, number>();
    let nodes = 0;
    const partition = (r: Int32Array, face: number): number => {
      if (++nodes > 4000 || performance.now() >= deadline) throw expired;
      const key = r.join(','), cached = memo.get(key);
      if (cached !== undefined) return cached;
      // A feasible greedy lower bound and the 3x maximum reward upper bound
      // prune branches without assuming the longest word is optimal.
      let best = 0;
      const greed = new Int32Array(r);
      for (const word of candidates) while (fits(word, greed)) { change(word, greed, -1); best += word.score; }
      if (best < 3 * face) for (const word of candidates) {
        if (!fits(word, r) || word.score + 3 * (face - word.face) <= best) continue;
        change(word, r, -1);
        const score = word.score + partition(r, face - word.face);
        change(word, r, 1);
        best = Math.max(best, score);
        if (best === 3 * face) break;
      }
      memo.set(key, best);
      return best;
    };
    let face = 0;
    for (let i = 0; i < 26; i++) face += rack[i]! * VALUE[i]!;
    try {
      const before = partition(new Int32Array(rack), face);
      const withTile = partition(new Int32Array(augmented), face + VALUE[letter]!);
      for (const word of candidates) {
        if (!fits(word, rack)) continue;
        const rest = new Int32Array(rack), restWithTile = new Int32Array(augmented);
        change(word, rest, -1); change(word, restWithTile, -1);
        if (word.score + partition(rest, face - word.face) !== before) continue;
        if (word.score + partition(restWithTile, face + VALUE[letter]! - word.face) === withTile) return d.words[word.index]!;
      }
    } catch (error) { if (error !== expired) throw error; }
    return null;
  }
}
export function createGauchoReference(dictionary: readonly string[], options: GauchoOptions = {}): SimStrategy {
  const reference = new GauchoReference(dictionary, options);
  return { name: reference.name, bid: (ctx: SimContext) => reference.bid(ctx), word: (ctx: SimContext) => reference.word(ctx) };
}
/** Runtime-compatible pure API; the live worker can call .word(ctx)/.bid(ctx). */
export function createGauchoStrategy(dictionary: readonly string[], options: GauchoOptions = {}): GauchoReference {
  return new GauchoReference(dictionary, options);
}
