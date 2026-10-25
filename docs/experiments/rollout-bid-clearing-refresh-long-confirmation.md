# Independent fixed-candidate confirmation

The `refresh16-full` clearing-price-integrated funded bidder remained unchanged
after its training, initial 52-case holdout and independent 104-case pilot.
This confirmation uses 252 **new** Vickrey matched pairs (504 games), with 126
six-player and 126 seven-player cases. Three rosters are fully crossed with
every seat: all current production clones, production clones plus licensed
mutants, and production plus pressure-14/16/18. There are seven repetitions for
six players (6×3×7) and six for seven players (7×3×6). Seeds derive from
721000019. No parameter selection or retuning uses these cases.

Control and candidate share each seed, own seat and reacting opponent policies.
Both use current exact terminal liquidation and last-tile denial over the
attributed licensed Gaucho reference. Only the candidate's bid changes. No live
state, private opponent holdings, actual future bag or future rival thresholds
enter the policy. The optional own-seat context was explicitly available before
the run. Eleven source hashes were unchanged from start to finish. There were
zero invalid actions or errors.

| All 252 pairs | Control | Candidate | Paired change |
| --- | ---: | ---: | ---: |
| Mean score | 73.341 | 74.143 | +0.802, SE 0.408 |
| Tie-adjusted wins | 56.5 | 60.833 | +1.72 pp, SE 1.68 pp |
| Mean rank | 3.183 | 3.099 | −0.083 |
| Mean tiles won | 9.873 | 10.028 | +0.155 |
| Mean final cash | 15.476 | 14.952 | −0.524 |
| Maximum decision | 25.41 ms | 72.55 ms | |

Scores improved in 82 cases and worsened in 48. Of 3,488 eligible modeled
decisions, 3,179 completed and 309 expired to the normal control bid (8.86%).
There were 473 changed bids: 181 raised and 292 lowered. The global model budget
was 70 ms; observed caller time includes setup/control work and deadline-check
granularity.

| Subset | Cases | Score change | Control → candidate wins |
| --- | ---: | ---: | ---: |
| Six players | 126 | +1.048 | 34.5 → 34.5 |
| Seven players | 126 | +0.556 | 22 → 26.333 |
| All current production clones | 84 | −0.095 | 11.5 → 9.5 |
| Production plus mutants | 84 | +0.500 | 14.5 → 15.5 |
| Production plus pressure | 84 | +2.000 | 30.5 → 35.833 |

The aggregate win improvement repeats the earlier fixed pilot, but its
uncertainty still includes zero. Gains concentrate against heterogeneous
pressure opponents; the all-clones subset loses two wins and has flat score.
**This is a promising environment-dependent candidate, not proof of broad
competitive dominance or a guaranteed winning deployment.** Do not infer that
the subset splits justify new gating without another untouched test.

Three positive win flips, three negative flips and three score regressions are
preserved as full simulation traces. A post-hoc first-divergence review
reconstructs only each legally known initial own deal and prior public events;
future events never enter valuation. All nine recorded bid differences reproduce
exactly when recomputed, so the examples represent actual strategy choices:

- Seed 883895928, six clones: `AIROV`, 33 cash, U with 14 auctions remaining.
  Bid 15→0; final score 79→96, a win gained.
- Seed 899365953, six-player mutants: `AEOVCDL`, 16 cash, D with 14 remaining.
  Bid 7→16; final score 87→96, a win gained.
- Seed 883995931, seven clones: `OEAISU`, 50 cash, N with 11 remaining.
  Bid 13→19; final score 99→72, a win lost.
- Seed 754176640, seven clones: `ELAOSTWDR`, 35 cash, A with 15 remaining.
  Bid 8→34; score 55→41. Speculative purchases can still hurt.

The precise tested policy includes both the class options and factory:

```ts
new ClearingPriceRolloutBidStrategy(base, reference, {
  maximumRounds: 16, strength: 1, samples: 4, timeBudgetMs: 70,
  riskPenalty: .5, improvementMargin: .5, thresholdSamples: 16,
}, (r, c, o) => createMarketRolloutValuation(r, c, {
  ...o, refreshAfterPurchases: 3,
  sampleThreshold: (future, letter, rng) =>
    sampleRivalThreshold({ ...future, letter }, rng,
      { clampToPublicBalances: false }),
}));
```

The class default by itself is **not** this candidate. Current-price quantiles
remain capped by known rival cash; only hypothetical future thresholds disable
that cap because cashouts may replenish future capital. Distinct actual costs
are memoized across repeated quantiles within a decision.

Reproduce with `bot-starter/node_modules/.bin/tsx
docs/experiments/rollout-bid-clearing-refresh-long-confirmation.mts`; full
outcomes, metrics, source hashes and traces are in the matching `-report.json`.
Run `rollout-bid-clearing-refresh-review.mts` for the separate diagnostic vectors.
No production files, process, deployment or account settings were changed.
