/**
 * Exact rules, fast rack search and bounded multiword liquidation for ScrabbleBot.
 * A word's letter order does not affect this game's rewards, so one spelling per
 * anagram is enough. No ordinary-Scrabble board or leave table is used here.
 */
export const LETTER_VALUE: Readonly<Record<string, number>> = Object.freeze({
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8,
  K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1,
  U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
});
const VALUES = Uint8Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ", c => LETTER_VALUE[c]);

export function wordReward(word: string): number {
  let base = 0;
  for (const c of word.toUpperCase()) base += LETTER_VALUE[c] ?? 0;
  const n = word.length;
  const numerator = n <= 3 ? 2 : n === 4 ? 3 : n === 5 ? 4 : n === 6 ? 5 : 6;
  return Math.floor(base * numerator / 2);
}

export interface WordCandidate {
  readonly word: string;
  readonly score: number;
  /** Alias for score, useful when comparing a play to a future rack value. */
  readonly reward: number;
  readonly length: number;
  readonly mask: number;
  readonly counts: Uint8Array;
}

export interface NearWordCandidate extends WordCandidate {
  readonly missing: Map<string, number>;
  readonly missingCount: number;
}

interface IndexedWord extends WordCandidate {
  readonly sparse: Uint8Array;
  readonly faceValue: number;
}

export interface PackingOptions {
  timeBudgetMs?: number;
  maxNodes?: number;
}

export interface PackingResult {
  score: number;
  words: string[];
  remaining: Map<string, number>;
  /** True only when the search proved optimal, never merely when it found a play. */
  exact: boolean;
  nodes: number;
}

interface SearchResult {
  score: number;
  words: number[];
  exact: boolean;
}

function rackCounts(rack: ReadonlyMap<string, number>): Uint16Array {
  const counts = new Uint16Array(26);
  for (const [letter, raw] of rack) {
    const slot = letter.toUpperCase().charCodeAt(0) - 65;
    if (letter.length !== 1 || slot < 0 || slot >= 26 || !Number.isFinite(raw)) continue;
    // A complete game has 98 tiles. Keeping oversized inputs bounded also avoids
    // overflow or pathological recursion when callers pass malformed rack data.
    counts[slot] = Math.min(98, counts[slot] + Math.max(0, Math.floor(raw)));
  }
  return counts;
}

function countMask(counts: Uint16Array): number {
  let mask = 0;
  for (let i = 0; i < 26; i++) if (counts[i]) mask |= 1 << i;
  return mask;
}

function fits(word: IndexedWord, counts: Uint16Array): boolean {
  for (let j = 0; j < word.sparse.length; j += 2) {
    if (word.sparse[j + 1] > counts[word.sparse[j]]) return false;
  }
  return true;
}

function change(word: IndexedWord, counts: Uint16Array, direction: 1 | -1): void {
  for (let j = 0; j < word.sparse.length; j += 2) {
    counts[word.sparse[j]] += direction * word.sparse[j + 1];
  }
}

function asMap(counts: Uint16Array): Map<string, number> {
  const result = new Map<string, number>();
  for (let i = 0; i < 26; i++) if (counts[i]) result.set(String.fromCharCode(65 + i), counts[i]);
  return result;
}

/** Construct once at startup, then reuse the index for every auction. */
export class WordEngine {
  private readonly entries: readonly IndexedWord[];
  readonly wordCount: number;
  readonly anagramCount: number;
  private readonly playableCache = new Map<string, readonly IndexedWord[]>();

  constructor(dictionary: readonly string[]) {
    const anagrams = new Map<string, IndexedWord>();
    let validWords = 0;
    for (const raw of dictionary) {
      const word = raw.trim().toUpperCase();
      if (!/^[A-Z]{2,98}$/.test(word)) continue;
      validWords++;
      const counts = new Uint8Array(26);
      for (let i = 0; i < word.length; i++) counts[word.charCodeAt(i) - 65]++;
      // Fixed-width byte keys are substantially cheaper than sorting each word.
      const signature = String.fromCharCode(...counts);
      const prior = anagrams.get(signature);
      if (prior && prior.word <= word) continue;
      const sparse: number[] = [];
      let mask = 0;
      let faceValue = 0;
      for (let i = 0; i < 26; i++) if (counts[i]) {
        sparse.push(i, counts[i]);
        mask |= 1 << i;
        faceValue += counts[i] * VALUES[i];
      }
      const score = wordReward(word);
      anagrams.set(signature, {
        word, score, reward: score, length: word.length, mask, counts,
        sparse: Uint8Array.from(sparse), faceValue,
      });
    }
    // All query results inherit this order without sorting each auction.
    this.entries = [...anagrams.values()].sort((a, b) =>
      b.score - a.score || b.length - a.length || a.word.localeCompare(b.word));
    this.wordCount = validWords;
    this.anagramCount = this.entries.length;
  }

  private playableEntries(counts: Uint16Array): readonly IndexedWord[] {
    const key = counts.join(",");
    const cached = this.playableCache.get(key);
    if (cached) return cached;
    const mask = countMask(counts);
    let total = 0;
    for (const count of counts) total += count;
    const results: IndexedWord[] = [];
    for (const word of this.entries) {
      if (word.length <= total && (word.mask & ~mask) === 0 && fits(word, counts)) results.push(word);
    }
    if (this.playableCache.size >= 96) this.playableCache.delete(this.playableCache.keys().next().value!);
    this.playableCache.set(key, results);
    return results;
  }

  playable(rack: ReadonlyMap<string, number>): WordCandidate[] {
    return [...this.playableEntries(rackCounts(rack))];
  }

  /** Includes playable words (missingCount=0), then near completions. */
  nearWords(rack: ReadonlyMap<string, number>, maxMissing = 3): NearWordCandidate[] {
    const counts = rackCounts(rack);
    const limit = Number.isFinite(maxMissing) ? Math.max(0, Math.min(26, Math.floor(maxMissing))) : 3;
    const mask = countMask(counts);
    let total = 0;
    for (const count of counts) total += count;
    const results: NearWordCandidate[] = [];
    for (const word of this.entries) {
      if (word.length > total + limit) continue;
      let missingKinds = word.mask & ~mask;
      let kinds = 0;
      while (missingKinds) { missingKinds &= missingKinds - 1; kinds++; }
      if (kinds > limit) continue;
      let missingCount = 0;
      const needed: number[] = [];
      for (let j = 0; j < word.sparse.length; j += 2) {
        const i = word.sparse[j];
        const deficit = word.sparse[j + 1] - counts[i];
        if (deficit > 0) {
          missingCount += deficit;
          if (missingCount > limit) break;
          needed.push(i, deficit);
        }
      }
      if (missingCount > limit) continue;
      const missing = new Map<string, number>();
      for (let j = 0; j < needed.length; j += 2) missing.set(String.fromCharCode(65 + needed[j]), needed[j + 1]);
      results.push({ ...word, missing, missingCount });
    }
    return results;
  }

  /**
   * Maximize total legal rewards, allowing repeated words when duplicate tiles
   * exist. Results always describe a feasible packing, even on timeout.
   * Only completed subproblems enter the exact memo table.
   */
  bestPacking(rack: ReadonlyMap<string, number>, options: PackingOptions = {}): PackingResult {
    const started = performance.now();
    const requestedBudget = options.timeBudgetMs ?? 25;
    const requestedNodes = options.maxNodes ?? 12_000;
    const budget = Number.isFinite(requestedBudget) ? Math.max(0, requestedBudget) : 25;
    const maxNodes = Number.isFinite(requestedNodes) ? Math.max(0, Math.floor(requestedNodes)) : 12_000;
    const deadline = started + budget;
    const counts = rackCounts(rack);
    const candidates = this.playableEntries(counts);
    let nodes = 0;
    let timedOut = false;
    const memo = new Map<string, SearchResult>();

    const greedy = (): SearchResult => {
      let score = 0;
      const words: number[] = [];
      for (let i = 0; i < candidates.length; i++) {
        const word = candidates[i];
        while (fits(word, counts)) {
          change(word, counts, -1);
          words.push(i);
          score += word.score;
        }
      }
      for (const i of words) change(candidates[i], counts, 1);
      return { score, words, exact: false };
    };

    const solve = (faceValue: number): SearchResult => {
      const key = counts.join(",");
      const saved = memo.get(key);
      if (saved) return saved;
      const best = greedy();
      const upper = faceValue * 3;
      if (best.score === upper || candidates.length === 0) {
        best.exact = true;
        memo.set(key, best);
        return best;
      }
      if (nodes >= maxNodes || performance.now() >= deadline) {
        timedOut = true;
        return best;
      }
      nodes++;
      let completed = true;
      for (let i = 0; i < candidates.length; i++) {
        if ((i & 127) === 0 && (nodes >= maxNodes || performance.now() >= deadline)) {
          timedOut = true;
          completed = false;
          break;
        }
        const word = candidates[i];
        if (!fits(word, counts)) continue;
        const afterFace = faceValue - word.faceValue;
        if (word.score + 3 * afterFace <= best.score) continue;
        change(word, counts, -1);
        const child = solve(afterFace);
        change(word, counts, 1);
        if (word.score + child.score > best.score) {
          best.score = word.score + child.score;
          best.words = [i, ...child.words];
        }
        if (!child.exact) completed = false;
        if (best.score === upper) { completed = true; break; }
      }
      best.exact = completed;
      if (completed) memo.set(key, best);
      return best;
    };

    let face = 0;
    for (let i = 0; i < 26; i++) face += counts[i] * VALUES[i];
    const best = solve(face);
    for (const i of best.words) change(candidates[i], counts, -1);
    return {
      score: best.score,
      words: best.words.map(i => candidates[i].word),
      remaining: asMap(counts),
      exact: best.exact && (!timedOut || best.score === face * 3),
      nodes,
    };
  }
}
