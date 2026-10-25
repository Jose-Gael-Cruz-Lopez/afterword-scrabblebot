/** Offline test worker only; no database, network, token or runtime side effects. */
import { parentPort, workerData } from 'node:worker_threads';
import { mock } from 'node:test';
import { createFundedRuntimePolicy } from './funded-runtime.js';
import { GauchoReference } from './adapter.js';
import { ExactTerminalStrategy } from './terminal-exact.js';
import { LastTileDenial } from '../last-tile-denial.js';
import { ClearingPriceRolloutBidStrategy } from './rollout-bid-clearing.js';
import { createMarketRolloutValuation } from './rollout-cashout.js';
import { sampleRivalThreshold } from './threshold-prior.js';
import { runMatch, type SimStrategy } from '../simulate.js';

if (!parentPort) throw new Error('Parity fixture must run in a test worker');
const words = workerData.words as string[];
function frozen(name: string) {
  const reference = new GauchoReference(words, { name, terminalSafe: true });
  const base = new LastTileDenial(new ExactTerminalStrategy(reference, { timeBudgetMs: 18, maxNodes: 8000 }));
  return new ClearingPriceRolloutBidStrategy(base, reference, {
    maximumRounds: 16, strength: 1, samples: 4, timeBudgetMs: 70,
    riskPenalty: .5, improvementMargin: .5, thresholdSamples: 16,
  }, (r, c, o) => createMarketRolloutValuation(r, c, {
    ...o, refreshAfterPurchases: 3,
    sampleThreshold: (future, letter, rng) => sampleRivalThreshold({ ...future, letter }, rng, { clampToPublicBalances: false }),
  }));
}
function match(packaged: boolean) {
  const policies: SimStrategy[] = Array.from({ length: 6 }, (_, seat) => {
    const name = 'player-' + seat, p = seat === 2 && packaged ? createFundedRuntimePolicy(words, name) : frozen(name);
    return { name, bid: c => p.bid(c), word: c => p.word(c) };
  });
  const result = runMatch(policies, workerData.seed, { dictionary: words, auctionType: 'SecondPrice', trace: true });
  return { errors: result.errors, auctions: result.auctions, trace: result.trace,
    players: result.players.map(({ seat, score, balance, words, spent, tilesWon, rack }) => ({ seat, score, balance, words, spent, tilesWon, rack: [...rack] })) };
}
// This worker verifies construction semantics, not speed. Keep deadline tests
// and the real planner smoke test on their real clocks.
const clock = mock.method(performance, 'now', () => 0);
try { parentPort.postMessage({ frozen: match(false), packaged: match(true) }); }
finally { clock.mock.restore(); }
