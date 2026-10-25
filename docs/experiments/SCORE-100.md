# Recursive search and score-100 investigation

The release changes terminal search, not the licensed bidding parameters. The stronger cash-aware and population-aware strategies remain experimental: neither established a higher win rate on untouched games. A 100-point average has not been achieved.

## Released search improvement

One bounded exact set-packing solver now serves terminal cashouts, the last usable auction, and final liquidation. It branches on the remaining letter with the fewest legal consuming words. Every packing either omits a copy of that letter or contains a word consuming it, so both cases are searched. Anagrams share one branch. Memoization, feasible greedy lower bounds, a 3× face-value upper bound, cached optimal suffixes, and the pre-purchase payout floor remain.

The terminal cashout only sells a word when it preserves the certified optimum in **both** auction outcomes. Expired proofs authorize no sale. Search stays in the existing worker, capped at 18 ms / 8,000 nodes for final packing and 25 ms / 8,000 nodes for the safe cashout.

- `constrained-recursion.mts`: 256 demanding 10/12/14/16-tile racks, full ENABLE dictionary, identical 18 ms / 8,000-node limits. Completed proofs rose from 180 to 249; 69 new-only completions and zero old-only completions. Mean query time fell from 8.07 to 2.49 ms. Every jointly completed optimum agreed. These racks are a search stress test, not a representative live score sample.
- `shared-recursion-check.mts`: an independent 256-rack seed set checks the final shared implementation. Completed proofs rose from 180 to 251, with 71 new-only completions and zero old-only completions. Mean query time fell from 7.95 to 2.33 ms (3.4× faster). All jointly completed optima agreed.
- `shared-terminal-holdout.mts`: 168 fresh matched scenarios / 336 games, split evenly between six- and seven-player games, rotating all seats and three rival rosters. Control and opponents use both the frozen adapter and terminal solver from `330d6a7`. Mean score was 72.649 → 72.661, with two one-point improvements, zero regressions, and 166 unchanged pairs. Both policies had 27 tie-adjusted wins. Zero invalid actions. This supports a search improvement without a detected gameplay regression; it does not establish a higher win rate.
- All 94 tests and TypeScript compilation pass. An independent exhaustive small-rack oracle verifies the cashout decision in 192 rack/letter cases, including repeated tiles and unspent letters.

## Strategy experiments kept disabled

| Experiment | Validation | Decision |
| --- | --- | --- |
| Twelve static bidding / rack-value variants | 612 games; selected acquisition variant fell from 81.92 to 79.58 on holdout, wins 15 → 11 | Rejected |
| Disjoint-word cashflow | 72 matched pairs; zero improvements, one 23-point regression | Rejected |
| Funded terminal purchase | Initial +0.236 mean points; 144-pair untouched combined holdout +0.021, unchanged wins | Benefit not established |
| Eight seven-player market / liquidity variants | 546 games; selected variant's holdout mean 70.155 → 66.357, wins 18.5 → 12.5 | Rejected |
| Cash-aware completion confidence | 84 initial pairs: +1.429 mean points, wins 17.5 → 16.5. Independent 84-pair holdout: +0.429, wins 12.5 → 12.333 | Higher win rate not established |

The experimental classes are not imported by `runtime-planner-worker.ts`. Their complete runners and reports remain for reproducibility, including negative results. The cash-aware report metadata says rosters were equal; actual roster counts are recorded in each report's `byRoster` section and are 32/26/26. This does not change the matched comparisons.

## Tournament evidence

Tournament 1 used the previous `330d6a7` policy throughout its Swiss matches. Afterword scored 102, 55, 99, and 65, winning both six-player groups and finishing fourth and fifth in its seven-player groups. It finished with 17 Swiss points / 321 total points and was eliminated before the finals. These four games motivated the population experiment; they do not prove that player count caused the losses. The 102-point tournament win must not be attributed to later offline changes.

The tournament watcher was paused after elimination. The independent supervised bot continues casual games and can register for future open tournaments. This update does not re-enter Tournament 1.

## Reproduction and provenance

Run each `.mts` file with `bot-starter/node_modules/.bin/tsx` from this repository. Reports record the seeds, seats, rosters, paired results, and relevant source hashes. Historical reports describe the source loaded when they ran; later helper extraction does not retroactively change those results. For exact historical parameter-search reproduction, use `330d6a7`. `fixtures/terminal-before-score100/` preserves that revision's adapter and terminal solver with only relative import paths rewritten.

The eight pinned MIT-licensed core, parameter, and license blobs still match `UPSTREAM.json`. No competition server code was changed. Policies use our own rack and public completed-auction history, scores, and balances; they do not read live hidden bids, opponent-private racks, credentials, or future bag contents. Simulation seeds are used only to reproduce offline games.
