# Offline strategy validation

These experiments use the authoritative ENABLE dictionary and the local rules
simulator. They do not establish dominance against the live leaderboard. Win
counts split credit for tied first places, so half wins are possible. Every
reported completed run had zero invalid bids or words.

All six-player comparisons balance every strategy across every seat in each
auction mode. Parameters are explicit rather than inherited from current
production defaults. Source SHA-256 values and individual game scores are in the
reports. Frozen engine/strategy fixtures preserve the exact tested source.

## Fixed acquisition floors

`fixed-market-floor.mts` ran 24 fresh seeds in both auction modes: 48 games. The
six-player roster compared minimum bids 4/6/8, a patient seven-letter opponent,
and two completion-aware opponents. The common parameters were bid scale 2,
acquisition share 0.6, hold margin 2.5, maximum spend fraction 0.7 and future cost
1.2. Control source is pinned to commit `4c02709` in `fixtures/fixed-floor-core`.

| Minimum bid | Wins / 48 | Mean score | Ending cash | Longest decision |
| --- | ---: | ---: | ---: | ---: |
| 4 | 34.5 | 110.54 | 7.31 | 93.1 ms |
| 6 | 11.5 | 84.94 | 4.40 | 98.8 ms |
| 8 | 2 | 62.08 | 4.00 | 137.7 ms |

Result: raising the global floor was worse in this roster. See
`fixed-market-floor-report.json`.

## Public-price adaptive prototype

The small `adaptive-market-floor-quick12-report.json` compares cold-rack
thresholds 4/6 and higher fixed floors. It was inconclusive for win improvement.
The larger optional adaptive run was deliberately stopped when the task changed;
its partial report is marked with `stoppedFor` and is not completed evidence.

`market-stress.mts` then tested an independent wrapper against patient opponents
with raw minimum bids 14/16/18 plus completion bids. It ran 12 fresh seeds in
both modes, 24 games. Common-letter paid-price median was 14, with upper
quartile 16 and 90th percentile 18, resembling the observed high-price market.
The cold-rack-at-most-six wrapper with a 35% cash cap scored 70.5 and earned
6.5 wins, against control score 59.63 and four wins. The 70% cash cap was worse.
Vickrey wins remained two each for the wrapper and control. This was a proxy
policy; the actual production implementation needed its own test.

## Exact production market rebuild

`production-market-rebuild.mts` freezes the actual `ChampionStrategy` with
`marketRebuild: true`, including its vowel-balance guard, common-letter price
filter, first-price target and changed low-cash liquidation rule. Control is the
exact pre-adaptive source from `4c02709`. The other opponents use raw floors
14/16/18 with completion bids, plus a patient seven-letter opponent.

It ran 24 fresh seeds starting at 6,930,071 in both modes: 48 games, every seat
four times per mode. Both frozen source hashes match the report. Production
snapshot SHA-256 starts `2e2d736e`; control starts `86e0c796`.

| Policy | Wins / 48 | Mean score | Ending cash | Tiles acquired | Cash spent |
| --- | ---: | ---: | ---: | ---: | ---: |
| Exact production market rebuild | 12.5 | 66.75 | 4.06 | 11.92 | 162.69 |
| Frozen composite control | 22.5 | 74.02 | 10.44 | 16.98 | 163.58 |

By mode, production won 3/24 Vickrey games against control's 10/24, and 9.5/24
first-price games against control's 12.5/24. Common-letter paid-price medians
were 13 for Vickrey and 14 for first-price; upper quartile was 16 and 90th
percentile 18 in both. Production's longest local decision was 131.2 ms.

The exact production policy spends about as much cash as control but obtains
fewer tiles, and loses more games. This test therefore does **not** support
turning market rebuild on as a validated improvement. Any live trial must be
reported separately. See `production-market-rebuild-report.json`.

## Reproduction

From the repository root after installing the starter dependencies:

```sh
bot-starter/node_modules/.bin/tsx docs/experiments/fixed-market-floor.mts
bot-starter/node_modules/.bin/tsx docs/experiments/market-stress.mts
bot-starter/node_modules/.bin/tsx docs/experiments/production-market-rebuild.mts
```

Each command writes its adjacent report. `SCRABBLE_EXPERIMENT_SEEDS` and
`SCRABBLE_EXPERIMENT_SEED_START` allow a new held-out run. The completed reports
record their own seed counts, starting seeds, parameters and source hashes.
Bounded wall-clock search can cause small run-to-run differences under CPU
contention; this is why the source and timing evidence are preserved alongside
results.
