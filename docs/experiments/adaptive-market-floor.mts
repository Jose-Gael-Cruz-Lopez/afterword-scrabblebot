/**
 * Optional acquisition-floor experiment. Does not connect to a server.
 * Run from repository root:
 *   bot-starter/node_modules/.bin/tsx docs/experiments/adaptive-market-floor.mts
 * Every seed runs both auction modes; all six seats are evenly represented.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { ChampionStrategy, type StrategyParams } from '../../bot-starter/src/strategy.ts';
import { WordEngine, LETTER_VALUE } from '../../bot-starter/src/engine.ts';
import { loadDictionary, runMatch, type SimContext, type SimStrategy } from '../../bot-starter/src/simulate.ts';

const dictionary = loadDictionary();
const engine = new WordEngine(dictionary);
const composite: StrategyParams = {
  bidScale: 2, minimumBid: 4, maximumSpendFraction: .7,
  acquisitionShare: .6, holdMargin: 2.5, futureCost: 1.2,
};

/** Uses only our rack/cash and ordinary public completed-auction prices. */
export function adaptiveBid(base: number, ctx: SimContext, maximumRack = 4): number {
  const count = [...ctx.myRack.values()].reduce((sum, n) => sum + n, 0);
  if (count > maximumRack || ctx.roundsRemaining <= 8 || ctx.myBalance <= 0 || (ctx.myRack.get(ctx.letter) ?? 0) >= 2) return base;
  const face = LETTER_VALUE[ctx.letter] ?? 0;
  if (!face) return base;
  // Do not let a rare Q/Z auction set the price of ordinary vowels/consonants.
  const category = face <= 2 ? 2 : face <= 5 ? 5 : 10;
  const prices = ctx.history.filter(a => a.paid > 0 && (LETTER_VALUE[a.letter] ?? 0) <= category)
    .slice(-18).map(a => a.paid).sort((a, b) => a - b);
  if (prices.length < 4) return base;
  const price = prices[Math.floor((prices.length - 1) * .65)];
  // Vickrey winners usually pay less than their declared cap. First-price
  // winners actually pay it, so discount that floor rather than chase prices.
  const rawFloor = ctx.auctionType === 'FirstPrice' ? (price + 2) * .75 : price + 2;
  const floor = Math.min(Math.floor(rawFloor), Math.floor(ctx.myBalance * .35), Math.floor(ctx.myBalance));
  return Math.max(base, Math.max(0, floor));
}

function champion(name: string, params: Partial<StrategyParams>, adaptive = 0): SimStrategy {
  const planner = new ChampionStrategy(dictionary, { ...composite, ...params }, engine);
  let initialRack: Map<string, number> | undefined;
  return {
    name,
    word(ctx) { initialRack ??= new Map(ctx.myRack); return planner.chooseWord({ ...ctx, initialRack }); },
    bid(ctx) {
      initialRack ??= new Map(ctx.myRack);
      const base = planner.decideBid({ ...ctx, initialRack });
      return adaptive ? adaptiveBid(base, ctx, adaptive) : base;
    },
  };
}

function patient(name: string, target: number, aggression: number): SimStrategy {
  let lastKey = '', near: ReturnType<WordEngine['nearWords']> = [];
  return {
    name,
    word(ctx) {
      const candidates = engine.playable(ctx.myRack);
      if (!candidates.length) return null;
      if (ctx.roundsRemaining <= 2) return engine.bestPacking(ctx.myRack, { timeBudgetMs: 4, maxNodes: 500 }).words[0] ?? candidates[0].word;
      if (ctx.myBalance < 10 || ctx.roundsRemaining <= 6 || [...ctx.myRack.values()].reduce((n, count) => n + count, 0) >= 15) return candidates[0].word;
      return candidates.find(w => w.length >= target)?.word ?? null;
    },
    bid(ctx) {
      if (ctx.roundsRemaining <= 1) return 0;
      const key = [...ctx.myRack].sort().map(([c, n]) => c + n).join('');
      if (key !== lastKey) { lastKey = key; near = engine.nearWords(ctx.myRack, 2); }
      const before = engine.playable(ctx.myRack)[0]?.score ?? 0;
      let value = 1 + (LETTER_VALUE[ctx.letter] ?? 1) * .8;
      for (const word of near) {
        if (!(word.missing.get(ctx.letter) ?? 0)) continue;
        if (word.missingCount === 1) value = Math.max(value, (word.score - before) * aggression);
        else if (word.length >= target) value = Math.max(value, word.score * .12);
      }
      const vowels = [...ctx.myRack].filter(([c]) => 'AEIOU'.includes(c)).reduce((n, [, count]) => n + count, 0);
      if (vowels < 2 && 'AEIOU'.includes(ctx.letter)) value = Math.max(value, 5);
      return Math.min(ctx.myBalance, Math.floor(ctx.myBalance * .5), Math.max(0, Math.floor(value * (ctx.auctionType === 'FirstPrice' ? .8 : 1))));
    },
  };
}

const synthetic = {
  myRack: new Map([['A', 1], ['T', 1]]), myBalance: 100, roundsRemaining: 30, letter: 'E', auctionType: 'SecondPrice',
  history: [10, 12, 12, 14, 13, 12].map((paid, round) => ({ round, letter: 'E', paid })),
} as SimContext;
assert.equal(adaptiveBid(9, synthetic), 14);
assert.equal(adaptiveBid(9, { ...synthetic, roundsRemaining: 1 }), 9);
assert.equal(adaptiveBid(1, { ...synthetic, myBalance: 2 }), 1);
assert.equal(adaptiveBid(0, { ...synthetic, myBalance: 0 }), 0);

const factories = [
  () => champion('adaptive-market-cold4', {}, 4),
  () => champion('composite-control', {}),
  () => champion('composite-floor6', { minimumBid: 6 }),
  () => champion('composite-floor8', { minimumBid: 8 }),
  () => patient('patient-seven', 7, 1.25),
  () => champion('adaptive-market-cold6', {}, 6),
];
const count = Number(process.env.SCRABBLE_EXPERIMENT_SEEDS ?? 6);
const startSeed = Number(process.env.SCRABBLE_EXPERIMENT_SEED_START ?? 2930071);
const report: any = {
  sourceSha256: Object.fromEntries(['strategy.ts', 'engine.ts', 'simulate.ts'].map(file => [file,
    createHash('sha256').update(readFileSync(new URL('../../bot-starter/src/' + file, import.meta.url))).digest('hex')])),
  params: composite, adaptive: { maximumRack: [4, 6], minimumAuctionsLeft: 9, history: 18, percentile: .65, premium: 2, cashCap: .35, firstPriceDiscount: .75 },
  dictionaryWords: dictionary.length, seedStart: startSeed, seedCount: count, matches: 0, errors: [], matchesDetail: [],
  rows: factories.map(make => ({ name: make().name, wins: 0, score: 0, spent: 0, tilesWon: 0, balance: 0, maxDecisionMs: 0, seats: Array(6).fill(0),
    byMode: Object.fromEntries(['FirstPrice', 'SecondPrice'].map(mode => [mode, { matches: 0, wins: 0, score: 0, seats: Array(6).fill(0) }])) })),
  startedAt: new Date().toISOString(),
};
const output = new URL('./adaptive-market-floor-report.json', import.meta.url);
const started = performance.now();
for (let n = 0; n < count; n++) {
  const seed = startSeed + n * 7919;
  for (let mode = 0; mode < 2; mode++) {
    const auctionType = mode ? 'FirstPrice' : 'SecondPrice';
    const rotation = (n * 5 + mode) % 6;
    const roster = factories.map((_, seat) => (seat + rotation) % 6);
    const result = runMatch(roster.map(i => factories[i]()), seed, { dictionary, auctionType });
    const top = Math.max(...result.players.map(p => p.score));
    const ties = result.players.filter(p => p.score === top).length;
    report.matches++;
    report.errors.push(...result.errors);
    report.matchesDetail.push({ seed, auctionType, scores: result.players.map(p => ({ name: p.name, score: p.score, balance: p.balance, spent: p.spent, tilesWon: p.tilesWon })) });
    for (let seat = 0; seat < 6; seat++) {
      const player = result.players[seat], row = report.rows[roster[seat]];
      const win = player.score === top ? 1 / ties : 0;
      row.wins += win; row.score += player.score; row.spent += player.spent; row.tilesWon += player.tilesWon; row.balance += player.balance;
      row.maxDecisionMs = Math.max(row.maxDecisionMs, player.maxBidMs, player.maxWordMs);
      row.seats[seat]++; row.byMode[auctionType].matches++; row.byMode[auctionType].wins += win; row.byMode[auctionType].score += player.score;
      row.byMode[auctionType].seats[seat]++;
    }
    console.log(JSON.stringify({ match: report.matches, seed, auctionType, top: result.players.filter(p => p.score === top).map(p => p.name), adaptiveScore: result.players.find(p => p.name === 'adaptive-market-cold4')!.score, controlScore: result.players.find(p => p.name === 'composite-control')!.score }));
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  }
}
report.elapsedMs = performance.now() - started;
report.finishedAt = new Date().toISOString();
for (const row of report.rows) {
  row.winRate = row.wins / report.matches; row.meanScore = row.score / report.matches;
  row.meanBalance = row.balance / report.matches; row.meanSpent = row.spent / report.matches; row.meanTilesWon = row.tilesWon / report.matches;
  for (const mode of Object.values(row.byMode) as any[]) { mode.winRate = mode.wins / mode.matches; mode.meanScore = mode.score / mode.matches; }
}
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ matches: report.matches, errors: report.errors, elapsedMs: report.elapsedMs, rows: report.rows }, null, 2));
