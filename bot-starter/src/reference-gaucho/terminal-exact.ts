/** Exact terminal extension around the attributed Gaucho adapter. */
import { GauchoReference, type GauchoContext } from './adapter.js';
import { bestPartition } from './core/dict.js';
import { rackFromMap } from './core/rules.js';
import { EXPIRED, PartitionOracle, exactTerminalPartition, type ExactTerminalOptions } from './terminal-search.js';
export { exactTerminalPartition, terminalCashoutFrontier } from './terminal-search.js';
export type { ExactTerminalOptions, ExactPartition, TerminalCashout } from './terminal-search.js';

interface TerminalPlan { readonly score: number; readonly words: readonly number[]; readonly exact: boolean }
const key = (rack: Int32Array): string => rack.join(',');
const finite = (n: number | undefined, fallback: number): number => n !== undefined && Number.isFinite(n) ? n : fallback;

/**
 * Earlier behavior and validated terminal-safe cashouts come from `base`.
 * Use a base configured with terminalSafe:true for the full protected flow.
 */
export class ExactTerminalStrategy {
  readonly name: string;
  private readonly certified = new Map<string, TerminalPlan>();
  constructor(readonly base: GauchoReference, readonly options: ExactTerminalOptions = {}) { this.name = base.name; }

  private remember(rack: Int32Array, result: TerminalPlan): void {
    let score = result.score;
    const rest = new Int32Array(rack);
    for (let n = 0; n <= result.words.length; n++) {
      if (this.certified.size >= 128) this.certified.delete(this.certified.keys().next().value!);
      const signature = key(rest), previous = this.certified.get(signature);
      if (!previous || previous.score < score || previous.score === score && !previous.exact) {
        this.certified.set(signature, { score, words: result.words.slice(n), exact: result.exact });
      }
      const index = result.words[n]; if (index === undefined) break;
      for (let i = 0; i < 26; i++) rest[i]! -= this.base.dictionary.counts[index * 26 + i]!;
      score -= this.base.dictionary.rew[index]!;
    }
  }
  /** The actual repeated licensed final-liquidation sequence, as a feasible floor. */
  private baselinePlan(rack: Int32Array): TerminalPlan {
    const rest = new Int32Array(rack), words: number[] = []; let score = 0;
    for (let n = 0; n < 50; n++) {
      const index = bestPartition(this.base.dictionary, rest).words[0];
      if (index === undefined) break;
      words.push(index); score += this.base.dictionary.rew[index]!;
      for (let i = 0; i < 26; i++) rest[i]! -= this.base.dictionary.counts[index * 26 + i]!;
    }
    return { score, words, exact: false };
  }
  word(ctx: GauchoContext): string | null {
    if ((ctx.roundsRemaining ?? 60) > 1) return this.base.word(ctx);
    const rack = rackFromMap(ctx.myRack), signature = key(rack);
    let result = this.certified.get(signature);
    if (!result?.exact) {
      const solved = exactTerminalPartition(this.base.dictionary, rack, this.options);
      if (solved) { this.remember(rack, solved); result = solved; }
    }
    if (!result) return this.base.word(ctx);
    if (!result.exact) {
      const baseline = this.baselinePlan(rack);
      if (baseline.score > result.score) result = baseline;
      this.remember(rack, result);
    }
    const index = result.words[0];
    return index === undefined ? null : this.base.dictionary.words[index]!;
  }
  bid(ctx: GauchoContext): number {
    if ((ctx.roundsRemaining ?? 60) <= 1) return 0;
    if (ctx.roundsRemaining !== 2) return this.base.bid(ctx);
    const letter = (ctx.letter ?? '').charCodeAt(0) - 65;
    const balance = Math.max(0, Math.floor(finite(ctx.myBalance, 100)));
    if (!balance || letter < 0 || letter >= 26) return 0;
    const rack = rackFromMap(ctx.myRack), augmented = new Int32Array(rack); augmented[letter]!++;
    const certifiedBefore = this.certified.get(key(rack)), certifiedAfter = this.certified.get(key(augmented));
    let before = certifiedBefore?.exact ? certifiedBefore : undefined;
    let after = certifiedAfter?.exact ? certifiedAfter : undefined;
    if (!before || !after) try {
      const oracle = new PartitionOracle(this.base.dictionary, augmented, this.options);
      before ??= oracle.solve(new Int32Array(rack));
      after ??= oracle.solve(new Int32Array(augmented));
    } catch (error) { if (error !== EXPIRED) throw error; }
    // A denial wrapper may intentionally buy a zero-value tile. Retain a full
    // feasible pre-purchase plan in both outcomes, even if the exact augmented
    // search expires. Added tiles can never invalidate that sequence.
    const floor = before ?? this.baselinePlan(rack);
    this.remember(rack, floor);
    this.remember(augmented, { ...floor, exact: false });
    if (after) this.remember(augmented, after);
    return before && after ? after.score > before.score ? balance : 0 : this.base.bid(ctx);
  }
}
