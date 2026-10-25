/** Package the frozen refresh16-full experiment for controlled runtime use.
 * This is a modest, uncertain aggregate improvement, not a winning guarantee.
 * The attributed Gaucho reference and exact/denial word policy stay unchanged.
 */
import type { BidContext } from '../strategy.js';
import { LastTileDenial, type LastTilePolicy } from '../last-tile-denial.js';
import { GauchoReference } from './adapter.js';
import { ExactTerminalStrategy } from './terminal-exact.js';
import { ClearingPriceRolloutBidStrategy, type ClearingBidDecision } from './rollout-bid-clearing.js';
import { createMarketRolloutValuation } from './rollout-cashout.js';
import { sampleRivalThreshold } from './threshold-prior.js';

export const FUNDED_RUNTIME_OPTIONS = Object.freeze({
  maximumRounds: 16, strength: 1, samples: 4, timeBudgetMs: 70,
  riskPenalty: .5, improvementMargin: .5, thresholdSamples: 16,
});

export interface FundedRuntimePolicy extends LastTilePolicy {
  readonly name: string;
  readonly reference: GauchoReference;
  readonly funded: ClearingPriceRolloutBidStrategy;
  readonly lastDecision: ClearingBidDecision | undefined;
}

/** One policy instance per match. `words` may share a compiled dictionary cache.
 * The custom factory is essential: the clearing bidder's defaults alone do not
 * refresh hypothetical target dictionaries and were not the confirmed policy.
 */
export function createFundedRuntimePolicy(words: readonly string[], name = 'Afterword'): FundedRuntimePolicy {
  const reference = new GauchoReference(words, { name, terminalSafe: true });
  const base = new LastTileDenial(new ExactTerminalStrategy(reference, { timeBudgetMs: 18, maxNodes: 8000 }));
  const funded = new ClearingPriceRolloutBidStrategy(base, reference, FUNDED_RUNTIME_OPTIONS,
    (r, c, o) => createMarketRolloutValuation(r, c, {
      ...o, refreshAfterPurchases: 3,
      sampleThreshold: (future, letter, rng) => sampleRivalThreshold(
        { ...future, letter }, rng, { clampToPublicBalances: false },
      ),
    }),
  );
  return {
    name, reference, funded,
    word: (context: BidContext) => funded.word(context),
    bid: (context: BidContext) => context.auctionType === 'SecondPrice' ? funded.bid(context) : base.bid(context),
    get lastDecision() { return funded.lastDecision; },
  };
}
