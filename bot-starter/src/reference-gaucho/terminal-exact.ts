/**
 * Original bounded exact terminal extension around the attributed Gaucho adapter.
 * It does not modify the vendored policy, parameter files or dictionary layout.
 */
import { GauchoReference, type GauchoContext } from './adapter.js';
import { bestPartition, spellableList, type Dict } from './core/dict.js';
import { rackFromMap, VALUE } from './core/rules.js';

export interface ExactTerminalOptions { timeBudgetMs?: number; maxNodes?: number }
export interface ExactPartition { readonly score: number; readonly words: readonly number[]; readonly exact: true }
interface TerminalPlan { readonly score: number; readonly words: readonly number[]; readonly exact: boolean }
interface Candidate { index: number; sparse: number[]; score: number; face: number }
const EXPIRED = Symbol('exact terminal budget');
const key = (rack: Int32Array): string => rack.join(',');
const finite = (n: number | undefined, fallback: number): number => n !== undefined && Number.isFinite(n) ? n : fallback;
function faceValue(rack: Int32Array): number { let n = 0; for (let i = 0; i < 26; i++) n += rack[i]! * VALUE[i]!; return n; }
function fits(word: Candidate, rack: Int32Array): boolean {
  for (let i = 0; i < word.sparse.length; i += 2) if (word.sparse[i + 1]! > rack[word.sparse[i]!]!) return false;
  return true;
}
function change(word: Candidate, rack: Int32Array, sign: number): void {
  for (let i = 0; i < word.sparse.length; i += 2) rack[word.sparse[i]!]! += sign * word.sparse[i + 1]!;
}

/** One bounded search universe covers every subset of its maximum rack. */
class PartitionOracle {
  private readonly candidates: Candidate[] = [];
  private readonly memo = new Map<string, ExactPartition>();
  private nodes = 0;
  private readonly deadline: number;
  private readonly maxNodes: number;
  constructor(readonly dictionary: Dict, maximumRack: Int32Array, options: ExactTerminalOptions) {
    this.deadline = performance.now() + Math.max(0, Math.min(25, finite(options.timeBudgetMs, 18)));
    this.maxNodes = Math.max(0, Math.floor(finite(options.maxNodes, 8000)));
    const seen = new Set<string>();
    const available = spellableList(dictionary, maximumRack, dictionary.n);
    for (let j = 0; j < available.length; j++) {
      if ((j & 127) === 0) this.guard();
      const index = available[j]!, offset = index * 26, sparse: number[] = [];
      let face = 0;
      for (let i = 0; i < 26; i++) if (dictionary.counts[offset + i]) {
        const count = dictionary.counts[offset + i]!;
        sparse.push(i, count); face += count * VALUE[i]!;
      }
      const signature = sparse.join(',');
      // Anagrams have identical consumption and reward. They must not occupy
      // several branch/beam slots and hide a different useful combination.
      if (seen.has(signature)) continue;
      seen.add(signature);
      this.candidates.push({ index, sparse, face, score: dictionary.rew[index]! });
    }
    this.guard();
  }
  private guard(): void { if (this.nodes >= this.maxNodes || performance.now() >= this.deadline) throw EXPIRED; }
  solve(rack: Int32Array, face = faceValue(rack)): ExactPartition {
    this.guard();
    const signature = key(rack), cached = this.memo.get(signature);
    if (cached) return cached;
    this.nodes++;
    const rest = new Int32Array(rack), greedy: number[] = [];
    let score = 0;
    for (let j = 0; j < this.candidates.length; j++) {
      if ((j & 127) === 0) this.guard();
      const word = this.candidates[j]!;
      while (fits(word, rest)) { change(word, rest, -1); greedy.push(word.index); score += word.score; }
    }
    let best: ExactPartition = { score, words: greedy, exact: true };
    if (score < face * 3) for (let j = 0; j < this.candidates.length; j++) {
      if ((j & 63) === 0) this.guard();
      const word = this.candidates[j]!;
      if (!fits(word, rack) || word.score + 3 * (face - word.face) <= best.score) continue;
      change(word, rack, -1);
      let tail: ExactPartition;
      try { tail = this.solve(rack, face - word.face); }
      finally { change(word, rack, 1); }
      if (word.score + tail.score > best.score) best = { score: word.score + tail.score, words: [word.index, ...tail.words], exact: true };
      if (best.score === face * 3) break;
    }
    this.memo.set(signature, best);
    return best;
  }
}

/** Returns null on budget exhaustion; it never labels an approximate score exact. */
export function exactTerminalPartition(dictionary: Dict, rack: Int32Array, options: ExactTerminalOptions = {}): ExactPartition | null {
  try { return new PartitionOracle(dictionary, rack, options).solve(new Int32Array(rack)); }
  catch (error) { if (error === EXPIRED) return null; throw error; }
}

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
