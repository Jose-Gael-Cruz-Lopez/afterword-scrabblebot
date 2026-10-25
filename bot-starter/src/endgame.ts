/**
 * Optional bounded short-horizon opportunity planner, independently implemented.
 * Samples public-estimated future auctions with common random numbers. It is an
 * approximation, not an exact opponent policy or access to the hidden bag.
 */
import { LETTER_VALUE, WordEngine, wordReward, type NearWordCandidate, type PackingResult } from './engine.js';

const BAG: Record<string, number> = { A:9,B:2,C:2,D:4,E:12,F:2,G:3,H:2,I:9,J:1,K:1,L:4,M:2,N:6,O:8,P:2,Q:1,R:6,S:4,T:6,U:4,V:2,W:2,X:1,Y:2,Z:1 };
export interface EndgameContext {
  myRack: ReadonlyMap<string, number>;
  myBalance: number;
  /** Current open auction's letter. */
  letter: string;
  /** Includes the current auction; the final auction's award is unusable. */
  roundsRemaining: number;
  auctionType?: string;
  history?: ReadonlyArray<{ letter: string; paid: number }>;
  initialRack?: ReadonlyMap<string, number>;
  /** Optional externally estimated remaining bag, excluding the current tile. */
  remainingDistribution?: ReadonlyMap<string, number>;
  baselineWord?: string | null;
  baselineBid?: number;
}
export interface EndgameOptions {
  timeBudgetMs?: number;
  samples?: number;
  maxHorizon?: number;
  seed?: number;
  minimumGain?: number;
}
export interface EndgameDecision {
  word: string | null;
  bid: number;
  active: boolean;
  samples: number;
  elapsedMs: number;
  estimatedGain: number;
  exact: boolean;
  reason: 'outside-horizon' | 'budget' | 'final-flush' | 'last-buy' | 'sampled-gain' | 'baseline';
}
interface AuctionSample { letter: string; price: number }
interface Scenario { currentPrice: number; future: AuctionSample[] }
interface Choice { word: string | null; bid: number; rack: Map<string, number>; credit: number; cash: number }
const EXPIRED = Symbol('endgame deadline');
const keyFor = (rack: ReadonlyMap<string, number>): string => [...rack].filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)).map(([c, n]) => c + n).join('');
const finite = (n: number | undefined, fallback: number): number => n !== undefined && Number.isFinite(n) ? n : fallback;
function afterWord(rack: ReadonlyMap<string, number>, word: string | null): Map<string, number> {
  const next = new Map(rack);
  for (const c of word ?? '') { const n = (next.get(c) ?? 0) - 1; if (n > 0) next.set(c, n); else next.delete(c); }
  return next;
}
function withLetter(rack: ReadonlyMap<string, number>, letter: string): Map<string, number> {
  const next = new Map(rack); next.set(letter, (next.get(letter) ?? 0) + 1); return next;
}
function seeded(seed: number): () => number {
  let x = seed >>> 0 || 0x9e3779b9;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}
function stateSeed(ctx: EndgameContext): number {
  let seed = 2166136261;
  const text = keyFor(ctx.myRack) + ':' + ctx.letter + ':' + ctx.roundsRemaining + ':' + Math.floor(ctx.myBalance);
  for (const c of text) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return seed >>> 0;
}
function estimatedBag(ctx: EndgameContext): Map<string, number> {
  if (ctx.remainingDistribution) return new Map([...ctx.remainingDistribution].filter(([c, n]) => /^[A-Z]$/.test(c) && n > 0 && Number.isFinite(n)));
  const remaining = new Map(Object.entries(BAG));
  const take = (c: string, count: number) => remaining.set(c, Math.max(0, (remaining.get(c) ?? 0) - count));
  for (const [c, n] of ctx.initialRack ?? []) take(c, n);
  for (const a of ctx.history ?? []) take(a.letter, 1);
  take(ctx.letter, 1);
  return remaining;
}
function draw(pool: Map<string, number>, random: () => number): string | null {
  const total = [...pool.values()].reduce((sum, n) => sum + n, 0);
  if (total <= 0) return null;
  let at = random() * total;
  for (const [c, n] of pool) { at -= n; if (at < 0) { pool.set(c, Math.max(0, n - 1)); return c; } }
  return null;
}

export class EndgamePlanner {
  constructor(readonly engine: WordEngine) {}

  plan(ctx: EndgameContext, options: EndgameOptions = {}): EndgameDecision {
    const started = performance.now();
    const budget = Math.max(0, Math.min(150, finite(options.timeBudgetMs, 120)));
    const deadline = started + budget;
    const horizon = Math.floor(finite(ctx.roundsRemaining, 99));
    const maxHorizon = Math.max(2, Math.min(12, Math.floor(finite(options.maxHorizon, 8))));
    const balance = Math.max(0, Math.floor(finite(ctx.myBalance, 0)));
    let baselineWord = ctx.baselineWord ?? null;
    let baseCredit = baselineWord ? wordReward(baselineWord) : 0;
    let baselineBid = Math.max(0, Math.min(balance + baseCredit, Math.floor(finite(ctx.baselineBid, 0))));
    const finish = (data: Omit<EndgameDecision, 'elapsedMs'>): EndgameDecision => ({ ...data, elapsedMs: performance.now() - started });
    const fallback = (reason: 'budget' | 'outside-horizon' | 'baseline', samples = 0): EndgameDecision => finish({ word: baselineWord, bid: baselineBid, active: false, samples, estimatedGain: 0, exact: false, reason });
    if (horizon < 1 || horizon > maxHorizon || !/^[A-Z]$/.test(ctx.letter)) return fallback('outside-horizon');
    if (budget <= 0) return fallback('budget');
    const packing = new Map<string, PackingResult>();
    const near = new Map<string, NearWordCandidate[]>();
    const guard = () => { if (performance.now() >= deadline) throw EXPIRED; };
    const pack = (rack: ReadonlyMap<string, number>, terminal = false): PackingResult => {
      const key = keyFor(rack);
      const cached = packing.get(key); if (cached) return cached;
      guard();
      const result = this.engine.bestPacking(rack, { timeBudgetMs: Math.max(0, Math.min(terminal ? 30 : 3, deadline - performance.now())), maxNodes: terminal ? 10_000 : 300 });
      packing.set(key, result); return result;
    };
    try {
      const current = pack(ctx.myRack, horizon <= 2);
      if (baselineWord && !this.engine.playable(ctx.myRack).some(w => w.word === baselineWord)) {
        baselineWord = null; baseCredit = 0;
        baselineBid = Math.min(balance, baselineBid);
      }
      if (horizon === 1) return finish({ word: current.words[0] ?? null, bid: 0, active: true, samples: 0, estimatedGain: current.score, exact: current.exact, reason: 'final-flush' });
      const added = pack(withLetter(ctx.myRack, ctx.letter), horizon === 2);
      if (horizon === 2) {
        // Cash has no value after the last usable tile; any positive *score*
        // improvement merits the entire existing bankroll, not just the gain.
        if (!current.exact || !added.exact) return fallback('budget');
        if (balance > 0) return finish({ word: null, bid: added.score > current.score ? balance : 0, active: true, samples: 0, estimatedGain: Math.max(0, added.score - current.score), exact: true, reason: 'last-buy' });
        // With no cash, choose a legal liquidation that preserves the best
        // attainable post-purchase total, rather than inventing free credit.
        const words = this.engine.playable(ctx.myRack).slice(0, 6);
        let word = current.words[0] ?? null, best = current.score, bid = 0;
        for (const candidate of words) {
          const rest = afterWord(ctx.myRack, candidate.word), before = pack(rest, true), after = pack(withLetter(rest, ctx.letter), true);
          const total = candidate.score + after.score;
          if (after.score > before.score && total > best) { word = candidate.word; best = total; bid = candidate.score; }
        }
        return finish({ word, bid, active: true, samples: 0, estimatedGain: Math.max(0, best - current.score), exact: false, reason: 'last-buy' });
      }

      const positivePrices = (ctx.history ?? []).filter(a => a.paid > 0 && Number.isFinite(a.paid)).slice(-24).map(a => Math.floor(a.paid));
      const prices = positivePrices.length >= 4 ? positivePrices : [2, 4, 6, 8];
      const sortedPrices = [...prices].sort((a, b) => a - b);
      const level = (p: number) => sortedPrices[Math.floor((sortedPrices.length - 1) * p)] + 1;
      const random = seeded(finite(options.seed, stateSeed(ctx)));
      const sampleCount = Math.max(2, Math.min(32, Math.floor(finite(options.samples, 8))));
      const scenarios: Scenario[] = [];
      const pool = estimatedBag(ctx);
      for (let s = 0; s < sampleCount; s++) {
        const remaining = new Map(pool), future: AuctionSample[] = [];
        // There are H-2 usable *future* auctions after the known current tile.
        for (let n = 0; n < horizon - 2; n++) { const letter = draw(remaining, random); if (!letter) break; future.push({ letter, price: Math.max(1, prices[Math.floor(random() * prices.length)] + 1) }); }
        scenarios.push({ currentPrice: Math.max(1, prices[Math.floor(random() * prices.length)] + 1), future });
      }
      const cashWords = new Set<string | null>([null]);
      if (baselineWord) cashWords.add(baselineWord);
      // Two extra cashout alternatives are enough to bound work in a worker.
      if (current.words[0]) cashWords.add(current.words[0]);
      if (current.words[1]) cashWords.add(current.words[1]);
      const choices: Choice[] = [];
      let baselineIndex = -1;
      for (const word of cashWords) {
        const credit = word ? wordReward(word) : 0, cash = balance + credit;
        const bids = new Set([0, Math.min(cash, level(.5)), Math.min(cash, level(.8)), Math.floor(cash * .5), cash]);
        if (word === baselineWord) bids.add(baselineBid);
        for (const bid of bids) {
          if (word === baselineWord && bid === baselineBid) baselineIndex = choices.length;
          choices.push({ word, credit, cash, bid, rack: afterWord(ctx.myRack, word) });
        }
      }
      const opportunity = (rack: Map<string, number>, cash: number, future: AuctionSample[]): number => {
        guard();
        let best = pack(rack).score;
        if (cash <= 0 || !future.length) return best;
        const key = keyFor(rack);
        let targets = near.get(key);
        if (!targets) { guard(); targets = this.engine.nearWords(rack, Math.min(3, future.length)).filter(w => w.missingCount > 0); near.set(key, targets); }
        const byLetter = new Map<string, number[]>();
        for (const a of future) { const found = byLetter.get(a.letter) ?? []; found.push(a.price); byLetter.set(a.letter, found); }
        for (const p of byLetter.values()) p.sort((a, b) => a - b);
        let evaluated = 0;
        for (const target of targets) {
          let cost = 0, possible = true;
          for (const [c, n] of target.missing) { const available = byLetter.get(c); if (!available || available.length < n) { possible = false; break; } for (let i = 0; i < n; i++) cost += available[i]; }
          if (!possible || cost > cash) continue;
          guard();
          const completed = new Map(rack);
          for (const [c, n] of target.missing) completed.set(c, (completed.get(c) ?? 0) + n);
          best = Math.max(best, pack(completed).score);
          if (++evaluated >= 3) break;
        }
        return best;
      };
      const scores = choices.map(() => [] as number[]);
      let completedSamples = 0;
      for (const scenario of scenarios) {
        const row: number[] = [];
        try {
          for (const choice of choices) {
            guard();
            const wins = choice.bid >= scenario.currentPrice;
            const cash = choice.cash - (wins ? ctx.auctionType === 'FirstPrice' ? choice.bid : scenario.currentPrice : 0);
            const rack = wins ? withLetter(choice.rack, ctx.letter) : choice.rack;
            row.push(choice.credit + opportunity(rack, cash, scenario.future));
          }
        } catch (error) { if (error !== EXPIRED) throw error; break; }
        row.forEach((score, i) => scores[i].push(score)); completedSamples++;
      }
      if (completedSamples < 2 || baselineIndex < 0) return fallback('budget', completedSamples);
      const means = scores.map(samples => samples.reduce((sum, n) => sum + n, 0) / completedSamples);
      let best = baselineIndex;
      for (let i = 0; i < choices.length; i++) if (means[i] > means[best] + 1e-9 || (means[i] === means[best] && choices[i].word === choices[best].word && choices[i].bid < choices[best].bid)) best = i;
      const differences = scores[best].map((score, s) => score - scores[baselineIndex][s]);
      const gain = means[best] - means[baselineIndex];
      const variance = differences.reduce((sum, d) => sum + (d - gain) ** 2, 0) / Math.max(1, completedSamples - 1);
      const margin = Math.max(finite(options.minimumGain, 1.5), Math.sqrt(variance / completedSamples));
      if (best === baselineIndex || gain < margin) return fallback('baseline', completedSamples);
      return finish({ word: choices[best].word, bid: choices[best].bid, active: true, samples: completedSamples, estimatedGain: gain, exact: false, reason: 'sampled-gain' });
    } catch (error) { if (error === EXPIRED) return fallback('budget'); throw error; }
  }
}
