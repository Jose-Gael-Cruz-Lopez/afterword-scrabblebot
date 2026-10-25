import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { createFundedRuntimePolicy, FUNDED_RUNTIME_OPTIONS } from './funded-runtime.js';
import { GauchoReference } from './adapter.js';
import { ExactTerminalStrategy } from './terminal-exact.js';
import { LastTileDenial } from '../last-tile-denial.js';
import { ClearingPriceRolloutBidStrategy } from './rollout-bid-clearing.js';
import { createMarketRolloutValuation } from './rollout-cashout.js';
import { sampleRivalThreshold } from './threshold-prior.js';
import type { BidContext } from '../strategy.js';

const words = ['AT','ATE','EAT','TEA','EAR','ARE','ERA','ART','RAT','TAR','RATE','TEAR','TARE','STAR','TSAR','ARTS','RATS','STARE','TEARS','RATES','START','STARTED','TREAD','TRADE','READ','DEAR','DARE','ROAD','ROADS','RIDE','RIDES','SIDE','DIES','TIDE','TIDES','RED','ROD','RODE','DOE','DOES','DOSE','TO','DO','SO','IS','IT','AS','OR','AIR','RAIN','RAINS','TRAIN','TRAINS','STAIR','STAIRS','HERO','HEROS','HER','HERS','SHE','HE','OH','HO','OY','YO','YES','YET','BY','BE','BED','BEDS','BEAR','BEARS','BARE','BARES','CAR','CARS','CARE','CARES','RACE','RACES','RACED','CART','CARTS','CARDS','CARD','DARED','DART','DARTS'];
const rack = (s: string) => { const r = new Map<string, number>(); for (const c of s) r.set(c, (r.get(c) ?? 0) + 1); return r; };
const context = (changes: Partial<BidContext> = {}): BidContext => ({
  myRack: rack('EARST'), initialRack: rack('EARST'), myBalance: 25, letter: 'D', round: 55,
  roundsRemaining: 14, auctionType: 'SecondPrice', seat: 2,
  players: Array.from({ length: 6 }, (_, seat) => ({ seat, score: 30 + seat, balance: 20 + seat })),
  history: [{ round: 1, letter: 'A', winner: 1, paid: 12 }, { round: 2, letter: 'E', winner: 3, paid: 14 }],
  publicWords: [{ seat: 1, word: 'ART', reward: 3, round: 3 }], ...changes,
});
function frozen() {
  const reference = new GauchoReference(words, { name: 'Afterword', terminalSafe: true });
  const base = new LastTileDenial(new ExactTerminalStrategy(reference, { timeBudgetMs: 18, maxNodes: 8000 }));
  return new ClearingPriceRolloutBidStrategy(base, reference, {
    maximumRounds: 16, strength: 1, samples: 4, timeBudgetMs: 70,
    riskPenalty: .5, improvementMargin: .5, thresholdSamples: 16,
  }, (r, c, o) => createMarketRolloutValuation(r, c, {
    ...o, refreshAfterPurchases: 3,
    sampleThreshold: (future, letter, rng) => sampleRivalThreshold({ ...future, letter }, rng, { clampToPublicBalances: false }),
  }));
}
test('runtime package matches the exact frozen benchmark construction across auction contexts', t => {
  // Semantic parity must not depend on which construction loses CPU time to
  // another test process. Deadline fallback has separate real-clock coverage.
  t.mock.method(performance, 'now', () => 0);
  for (const c of [context(), context({ myRack: rack('AEIRST'), letter: 'N', myBalance: 40, roundsRemaining: 16 }),
    context({ myRack: rack('HERO'), letter: 'S', myBalance: 11, roundsRemaining: 7 }),
    context({ roundsRemaining: 17 }), context({ myBalance: 1 }), context({ auctionType: 'FirstPrice' }),
    context({ roundsRemaining: 2 }), context({ roundsRemaining: 1 })]) {
    const a = createFundedRuntimePolicy(words), b = frozen();
    assert.equal(a.word(c), b.word(c));
    assert.equal(a.bid(c), b.bid(c));
    assert.deepEqual(a.lastDecision, b.lastDecision);
  }
});
test('only literal paid SecondPrice is modeled; cashouts and exact/denial tail stay baseline', () => {
  for (const type of ['FirstPrice', 'Free', undefined]) {
    const p = createFundedRuntimePolicy(words), c = context({ auctionType: type });
    assert.equal(p.word(c), p.funded.base.word(c));
    assert.equal(p.bid(c), p.funded.base.bid(c));
    assert.equal(p.lastDecision, undefined);
  }
  const p = createFundedRuntimePolicy(words, 'controlled-run');
  assert.equal(p.name, 'controlled-run'); assert.equal(p.reference.name, 'controlled-run');
  assert.ok(Object.isFrozen(FUNDED_RUNTIME_OPTIONS));
  assert.equal(p.bid(context({ roundsRemaining: 2, myBalance: 23 })), 23);
  assert.equal(p.bid(context({ roundsRemaining: 1, myBalance: 23 })), 0);
  assert.equal(p.lastDecision, undefined);
});
test('complete multiplayer game matches frozen construction inside a tsx-loaded worker', { timeout: 10_000 }, async () => {
  const loader = createRequire(import.meta.url).resolve('tsx/esm/api');
  const entry = new URL('./funded-runtime-parity.worker.ts', import.meta.url);
  const worker = new Worker(`require(${JSON.stringify(loader)}).tsImport(${JSON.stringify(entry.href)}, ${JSON.stringify(import.meta.url)}).catch(e => { console.error(e); process.exitCode = 1; });`,
    { eval: true, execArgv: [], workerData: { words, seed: 601000031 } });
  try {
    const result: any = await new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); worker.once('exit', code => { if (code) reject(new Error('Worker exited ' + code)); }); });
    assert.deepEqual(result.frozen.errors, []); assert.deepEqual(result.packaged.errors, []);
    assert.deepEqual(result.packaged, result.frozen);
  } finally { await worker.terminate(); }
});
