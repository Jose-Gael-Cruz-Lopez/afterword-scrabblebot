# Independent budget-curve stress test

**Recommendation: retain the terminal-fixed control. Do not promote these curves.**

144 offline games tested three independently implemented budget curves against the current composite control, fixed acquisition-pressure opponents at 14/16/18, and a patient seven-letter opponent. Every panel used 24 fresh seeds in both auction modes. Across those 24 seeds each policy occupied each of six seats four times per mode. All actions were valid.

The control includes the new last-usable-auction hold/all-in and final-auction flush. `marketRebuild` is explicitly false. Source, simulator, engine and exact dictionary are frozen in `fixtures/budget-curve-core/`, with SHA-256 hashes in its manifest. No production source or running bot was changed.

| Curve | Second-price mean score: candidate / control | Mean place: candidate / control | First-price mean score: candidate / control | Mean place: candidate / control |
|---|---:|---:|---:|---:|
| Budget floor, rack ≤6 | 70.3 / 78.2 | 2.50 / 1.96 | 75.3 / 76.2 | 2.00 / 2.23 |
| Budget floor, any rack size | 69.8 / 80.1 | 2.54 / 1.92 | 76.5 / 75.4 | 1.90 / 2.23 |
| Square-root budget scaling | 72.5 / 75.5 | 2.38 / 2.33 | 74.4 / 81.1 | 2.08 / 1.77 |

Lower place is better. Controls differ between panels because the competing candidate changes the auction environment.

The floor is `min(0.35 × balance, balance × playerCount / remainingAuctions + 3)`, applied as a floor on the original bid. It requires fewer than two held copies, acceptable vowel balance, and face value at most four. The cold variant additionally requires at most six held tiles. Neither uses market prices or rival bids. The scaling variant multiplies the original bid by `clamp(sqrt(balance / (remainingAuctions + 1) / 3), 0.6, 3)`. All retain the original terminal actions in the final two auctions.

The floors reduce stranded cash, but second-price scoring and placement get worse. The unrestricted floor's paired score change is −10.38 points (descriptive approximate 95% interval −19.89 to −0.86). Its small first-price gain has a wide interval crossing zero. Square-root scaling weakens first-price performance and leaves more unused money. Reducing leftover cash alone is therefore insufficient evidence of improvement.

Reproduce from the repository root:

```sh
VARIANT=cold6 SEEDS=24 SEED_START=8130071 bot-starter/node_modules/.bin/tsx docs/experiments/budget-curves.mts
VARIANT=open-floor SEEDS=24 SEED_START=8130071 bot-starter/node_modules/.bin/tsx docs/experiments/budget-curves.mts
VARIANT=sqrt SEEDS=24 SEED_START=8130071 bot-starter/node_modules/.bin/tsx docs/experiments/budget-curves.mts
```

Raw results are `budget-cold6-report.json`, `budget-open-floor-report.json`, and `budget-sqrt-report.json`; paired analysis is `budget-curves-summary.json`.

These opponents are synthetic stress tests, not replicas of live leading bots. The experiment balances seats across seeds rather than rotating all six seats for each individual seed. Decision timings include concurrent local processes; bounded wall-clock packing can vary with CPU load. No live-win claim follows from these results. No external competitor source or learned weight table was transplanted.
