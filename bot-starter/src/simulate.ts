/** Offline simulator for the public human-bot rules in spacetimedb/src/game.ts.
 * No server connection, credentials or opponent-private holdings/bids are used.
 * This models a responsive client: it may cash out repeatedly during each open
 * auction, but cannot play the tile awarded by the final auction after it ends.
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
// Mirrored from spacetimedb/src/letters.ts, rather than importing a TS source
// outside bot-starter's rootDir. Tests assert the authoritative distribution.
const DEFAULT_BAG = [
  ["A",9],["B",2],["C",2],["D",4],["E",12],["F",2],["G",3],["H",2],["I",9],
  ["J",1],["K",1],["L",4],["M",2],["N",6],["O",8],["P",2],["Q",1],["R",6],
  ["S",4],["T",6],["U",4],["V",2],["W",2],["X",1],["Y",2],["Z",1],
] as const;
const VALUES: Record<string, number> = Object.fromEntries([
  ...[..."AEIOULNSTR"].map(c => [c, 1]), ...[..."DG"].map(c => [c, 2]),
  ...[..."BCMP"].map(c => [c, 3]), ...[..."FHVWY"].map(c => [c, 4]),
  ["K",5],["J",8],["X",8],["Q",10],["Z",10],
]);
const letterValue = (c: string): number => VALUES[c] ?? 0;
const lengthMultiplier = (len: number): [bigint,bigint] => len <= 3 ? [1n,1n] : len === 4 ? [3n,2n] : len === 5 ? [2n,1n] : len === 6 ? [5n,2n] : [3n,1n];

export type SimAuctionType = "SecondPrice" | "FirstPrice";
export interface SimPublicPlayer { seat: number; name: string; balance: number; score: number }
export interface SimAuctionResult { round: number; letter: string; winner?: number; paid: number }
export interface SimContext {
  letter: string;
  myBalance: number;
  myRack: Map<string, number>;
  dictionary: string[];
  /** Auctions still payable, INCLUDING the current open auction. */
  roundsRemaining: number;
  /** Tiles still in the bag; excludes the current open auction's tile. */
  bagRemaining: number;
  round: number;
  seat: number;
  auctionType: SimAuctionType;
  players: ReadonlyArray<SimPublicPlayer>;
  history: ReadonlyArray<SimAuctionResult>;
  /** Only words already submitted, never an opponent's rack or future action. */
  publicWords?: ReadonlyArray<{ seat:number; word:string; reward:number; round:number }>;
  /** Strategy-local seeded randomness, separate from dealing/tie randomness. */
  rng: () => number;
}
export interface SimStrategy {
  name: string;
  bid(ctx: SimContext): number;
  word(ctx: SimContext): string | null;
}
export interface SimOptions {
  auctionType?: SimAuctionType;
  startingTiles?: number;
  startingBalance?: number;
  dictionary?: string[];
  /** Tests may supply a miniature bag; it is shuffled exactly like the full bag. */
  bag?: string[];
  /** Keep word/bid events only when investigating an individual match. */
  trace?: boolean;
}
export interface SimPlayerResult extends SimPublicPlayer {
  rack: Map<string, number>;
  words: string[];
  spent: number;
  tilesWon: number;
  bidCalls: number;
  wordCalls: number;
  bidMs: number;
  wordMs: number;
  maxBidMs: number;
  maxWordMs: number;
}
export interface SimTraceEvent {
  kind: "bid" | "word";
  seat: number;
  round: number;
  amount?: number;
  word?: string;
  reward?: number;
}
export interface SimResult {
  seed: number;
  players: SimPlayerResult[];
  auctions: SimAuctionResult[];
  trace: SimTraceEvent[];
  errors: string[];
  elapsedMs: number;
}

let defaultDictionary: string[] | undefined;
export function loadDictionary(): string[] {
  return defaultDictionary ??= readFileSync(new URL("../../spacetimedb/wordlist.txt", import.meta.url), "utf8")
    .split(/\r?\n/).map(w => w.trim().toUpperCase()).filter(w => /^[A-Z]{2,}$/.test(w))
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
}

export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(items: T[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}
export function wordReward(word: string): number {
  const base = [...word].reduce((n, c) => n + letterValue(c), 0);
  const [num, den] = lengthMultiplier(word.length);
  return Number(BigInt(base) * num / den);
}
function spellable(word: string, rack: Map<string, number>): boolean {
  const used = new Map<string, number>();
  for (const c of word) {
    const n = (used.get(c) ?? 0) + 1;
    if (n > (rack.get(c) ?? 0)) return false;
    used.set(c, n);
  }
  return true;
}

export function runMatch(strategies: SimStrategy[], seed: number, options: SimOptions = {}): SimResult {
  const started = performance.now();
  if (!strategies.length) throw new Error("Need at least one participant");
  const dictionary = options.dictionary ?? loadDictionary();
  const validWords = new Set(dictionary);
  const random = seededRandom(seed);
  const strategyRandom = strategies.map((_, seat) => seededRandom(seed ^ Math.imul(seat + 1, 0x9e3779b1)));
  const bag = options.bag ? [...options.bag] : DEFAULT_BAG.flatMap(([letter, count]) => Array<string>(count).fill(letter));
  shuffle(bag, random);
  const startingTiles = options.startingTiles ?? 5;
  if (!Number.isInteger(startingTiles) || startingTiles < 0) throw new Error("Invalid startingTiles");
  if (startingTiles * strategies.length >= bag.length) throw new Error("No tile remains for the first auction");
  const auctionType = options.auctionType ?? "SecondPrice";
  const players: SimPlayerResult[] = strategies.map((s, seat) => ({
    name: s.name, seat, balance: options.startingBalance ?? 100, score: 0, rack: new Map(), words: [],
    spent: 0, tilesWon: 0, bidCalls: 0, wordCalls: 0, bidMs: 0, wordMs: 0, maxBidMs: 0, maxWordMs: 0,
  }));
  for (const player of players) for (let n = 0; n < startingTiles; n++) {
    const letter = bag.pop()!;
    player.rack.set(letter, (player.rack.get(letter) ?? 0) + 1);
  }
  const auctions: SimAuctionResult[] = [], trace: SimTraceEvent[] = [], errors: string[] = [];
  const publicWords: Array<{ seat:number; word:string; reward:number; round:number }> = [];
  let round = 0;
  while (bag.length > 0) {
    const letter = bag.pop()!;
    round++;
    const context = (seat: number): SimContext => ({
      letter, myBalance: players[seat]!.balance, myRack: new Map(players[seat]!.rack), dictionary,
      round, roundsRemaining: bag.length + 1, bagRemaining: bag.length, seat, auctionType,
      players: players.map(({ seat, name, balance, score }) => ({ seat, name, balance, score })),
      history: auctions.map(a => ({ ...a })), rng: strategyRandom[seat]!,
      publicWords: publicWords.map(w => ({ ...w })),
    });
    // All clients can use their existing rack while this auction is open.
    // Thus initial tiles are playable and the final awarded tile is not.
    for (let seat = 0; seat < players.length; seat++) {
      const player = players[seat]!, strategy = strategies[seat]!;
      for (let attempt = 0; attempt < 99; attempt++) {
        const before = performance.now();
        let candidate: string | null;
        try { candidate = strategy.word(context(seat)); }
        catch (e) { errors.push(`${strategy.name} word: ${String(e)}`); break; }
        finally {
          const ms = performance.now() - before;
          player.wordCalls++; player.wordMs += ms; player.maxWordMs = Math.max(player.maxWordMs, ms);
        }
        if (candidate === null) break;
        const word = candidate.toUpperCase();
        if (!/^[A-Z]{2,}$/.test(word) || !validWords.has(word) || !spellable(word, player.rack)) {
          errors.push(`${strategy.name} invalid word ${JSON.stringify(candidate)} on round ${round}`);
          break;
        }
        for (const c of word) {
          const count = player.rack.get(c)! - 1;
          if (count) player.rack.set(c, count); else player.rack.delete(c);
        }
        const reward = wordReward(word);
        player.score += reward; player.balance += reward; player.words.push(word);
        publicWords.push({ seat, word, reward, round });
        if (options.trace) trace.push({ kind: "word", seat, round, word, reward });
      }
    }
    const bids: Array<{ seat: number; amount: number }> = [];
    for (let seat = 0; seat < players.length; seat++) {
      const player = players[seat]!, strategy = strategies[seat]!;
      const before = performance.now();
      let amount = 0;
      try { amount = strategy.bid(context(seat)); }
      catch (e) { errors.push(`${strategy.name} bid: ${String(e)}`); }
      finally {
        const ms = performance.now() - before;
        player.bidCalls++; player.bidMs += ms; player.maxBidMs = Math.max(player.maxBidMs, ms);
      }
      if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0 || amount > player.balance) {
        errors.push(`${strategy.name} invalid bid ${String(amount)} on round ${round}`);
        amount = 0;
      }
      if (amount > 0) bids.push({ seat, amount });
      if (options.trace) trace.push({ kind: "bid", seat, round, amount });
    }
    // The server shuffles all positive bids and then stable sorts descending.
    shuffle(bids, random);
    bids.sort((a, b) => b.amount - a.amount);
    const first = bids[0], second = bids[1];
    let paid = 0;
    if (first) {
      paid = auctionType === "FirstPrice" ? first.amount : second?.amount ?? Math.min(1, first.amount);
      const player = players[first.seat]!;
      player.balance -= paid; player.spent += paid; player.tilesWon++;
      player.rack.set(letter, (player.rack.get(letter) ?? 0) + 1);
    }
    // A zero-bid auction still consumes its letter. The final auction closes
    // and ends the match atomically before external bots can play the award.
    auctions.push({ round, letter, winner: first?.seat, paid });
  }
  return { seed, players, auctions, trace, errors, elapsedMs: performance.now() - started };
}

interface Trie { next: Map<string, Trie>; word?: string; reward?: number }
const indexes = new WeakMap<string[], Trie>();
function index(dictionary: string[]): Trie {
  let root = indexes.get(dictionary);
  if (root) return root;
  root = { next: new Map() };
  for (const word of dictionary) {
    let node = root;
    for (const c of word) {
      let child = node.next.get(c);
      if (!child) { child = { next: new Map() }; node.next.set(c, child); }
      node = child;
    }
    node.word = word; node.reward = wordReward(word);
  }
  indexes.set(dictionary, root);
  return root;
}
function best(ctx: SimContext, mode: "longest" | "score"): { word: string | null; reward: number } {
  let chosen: string | null = null, reward = 0;
  const rack = new Map(ctx.myRack);
  function visit(node: Trie): void {
    if (node.word && (chosen === null ||
      (mode === "longest" ? node.word.length > chosen.length : node.reward! > reward) ||
      ((mode === "longest" ? node.word.length === chosen.length : node.reward === reward) && node.word < chosen))) {
      chosen = node.word; reward = node.reward!;
    }
    for (const [c, child] of node.next) {
      const count = rack.get(c) ?? 0;
      if (count === 0) continue;
      rack.set(c, count - 1); visit(child); rack.set(c, count);
    }
  }
  visit(index(ctx.dictionary));
  return { word: chosen, reward };
}
function starterBid(ctx: SimContext): number {
  const value = letterValue(ctx.letter), have = ctx.myRack.get(ctx.letter) ?? 0;
  return Math.min(have === 0 ? value + 2 : Math.max(1, value), ctx.myBalance);
}
/** Official starter's longest-word cashout and face-value-plus-two bids. */
export function createStarterBaseline(name = "starter"): SimStrategy {
  return { name, bid: starterBid, word: ctx => best(ctx, "longest").word };
}
/** Plausible improvement: maximize reward rather than word length. */
export function createScoreGreedyBaseline(name = "score-greedy"): SimStrategy {
  return { name, bid: starterBid, word: ctx => best(ctx, "score").word };
}
/** Completion-aware opponent with a cap to avoid blowing its bankroll. */
export function createCompletionBaseline(name = "one-tile-completion"): SimStrategy {
  return {
    name,
    word: ctx => best(ctx, "score").word,
    bid: ctx => {
      if (ctx.roundsRemaining <= 1) return 0;
      const before = best(ctx, "score").reward;
      const augmented = new Map(ctx.myRack);
      augmented.set(ctx.letter, (augmented.get(ctx.letter) ?? 0) + 1);
      const gain = best({ ...ctx, myRack: augmented }, "score").reward - before;
      const want = Math.max(starterBid(ctx), Math.floor(gain * 0.85));
      return Math.min(want, Math.max(0, Math.floor(ctx.myBalance * 0.35)));
    },
  };
}

export interface BenchmarkRow {
  name: string;
  matches: number;
  wins: number;
  winRate: number;
  meanScore: number;
  meanBalance: number;
  meanDecisionMs: number;
  maxDecisionMs: number;
  seatCounts: number[];
}
/** Rotate every seeded shuffled roster through every seat by default. */
export function benchmark(
  factories: Array<() => SimStrategy>,
  seeds: number[],
  options: SimOptions & { rotateSeats?: boolean } = {},
): { rows: BenchmarkRow[]; matches: number; elapsedMs: number; errors: string[] } {
  const started = performance.now();
  const totals = factories.map(make => ({ name: make().name, matches: 0, wins: 0, score: 0, balance: 0,
    decisionMs: 0, calls: 0, maxDecisionMs: 0, seatCounts: Array<number>(factories.length).fill(0) }));
  const errors: string[] = [];
  let matches = 0;
  for (const seed of seeds) {
    const order = factories.map((_, i) => i);
    shuffle(order, seededRandom(seed ^ 0x51ed270b));
    const rotations = options.rotateSeats === false ? 1 : factories.length;
    for (let rotation = 0; rotation < rotations; rotation++) {
      const roster = order.map((_, seat) => order[(seat + rotation) % order.length]!);
      const match = runMatch(roster.map(i => factories[i]!()), seed, options);
      matches++;
      errors.push(...match.errors);
      const top = Math.max(...match.players.map(p => p.score));
      const ties = match.players.filter(p => p.score === top).length;
      match.players.forEach((p, seat) => {
        const total = totals[roster[seat]!]!;
        total.matches++; total.score += p.score; total.balance += p.balance;
        if (p.score === top) total.wins += 1 / ties;
        total.decisionMs += p.bidMs + p.wordMs; total.calls += p.bidCalls + p.wordCalls;
        total.maxDecisionMs = Math.max(total.maxDecisionMs, p.maxBidMs, p.maxWordMs);
        total.seatCounts[seat]!++;
      });
    }
  }
  return {
    matches, elapsedMs: performance.now() - started, errors,
    rows: totals.map(t => ({ name: t.name, matches: t.matches, wins: t.wins, winRate: t.wins / t.matches,
      meanScore: t.score / t.matches, meanBalance: t.balance / t.matches,
      meanDecisionMs: t.decisionMs / t.calls, maxDecisionMs: t.maxDecisionMs, seatCounts: t.seatCounts })),
  };
}
