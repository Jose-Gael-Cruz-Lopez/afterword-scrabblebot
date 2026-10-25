# Licensed parameter tuning: keep current parameters

Offline parameter-only search with the production licensed policy and `terminalSafe: true`. No live process, runtime source, adapter or vendored policy was changed.

Twelve targeted candidates covered spending pace, acquisition valuation, cashout threshold, low working capital, future-letter probability and early bid caps. Training used 24 fresh paired scenarios per candidate against three competitive rosters with licensed clones and mutants, price-pressure bots (14/16/18) and a patient seven-letter bot. The control and candidate each occupied exactly the same seat with the same seed/opponent policies.

None improved both training win rate and mean score. As specified before opening holdout results, the highest win-rate candidate, `long-builder`, advanced despite its small training score decline. Its overrides were `minPlayReward:48, maxMissing:3, pBase:.9, aHalf:.6`.

Validation used 48 untouched paired scenarios (96 separate games), 24 per auction mode. Each focal policy occupied every seat four times per mode. Training and validation seeds are disjoint. Total experiment: **408 games, zero invalid actions**, about 154 seconds.

| Holdout | Control | Candidate |
|---|---:|---:|
| Tie-adjusted wins | 17/48 | 16.5/48 |
| Win rate | 35.42% | 34.38% |
| Mean score | 84.17 | 85.77 |
| Mean decision | 0.57ms | 1.12ms |
| Maximum decision | 13.97ms | 33.37ms |

The paired win-rate difference was −1.04 percentage points (standard error 6.90 points). The score difference was +1.60 (standard error 2.20). The apparent training win improvement did not carry into the validation set. Vickrey wins fell from 9/24 to 7/24; first-price wins rose from 8/24 to 9.5/24, with substantial uncertainty.

**Decision: retain current production parameters.** This experiment supplies negative evidence against broad spending/cashout changes; it does not establish a stronger policy. The validation set must not be reused for tuning.

Reproduce from the repository root:

```sh
bot-starter/node_modules/.bin/tsx docs/experiments/licensed-tuning.mts
```

Full candidate parameters, per-scenario outcomes, paired uncertainty, per-mode results and source hashes are in `licensed-tuning-report.json`.
