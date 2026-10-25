# Score-100 investigation — research, not the live tournament policy

The live licensed policy's22 completed pre-tournament games averaged88.5points; the latest12 averaged90.33. Four cleared100. Tournament1 Round1 then won with102against92, using the existing330d6a7 policy; this result must not be attributed to the new offline experiments. Round2 scored55in a seven-player group. A100-point average has not been established.

## What was tested

- `score-100-search.mts`: Vickrey-specific twelve-candidate search.36training scenarios, full seat/roster crossing; selected highest mean score before72untouched paired holdout cases.612games total, zero invalid actions. The selected acquisition-floor variant fell from control81.92 to79.58on holdout, and wins15→11. Rejected.
- `packing-cashflow-matched.mts`: recognizes a disjoint bundle of mature words below the individual forty-point threshold, while requiring a favorable comparison with the licensed future-value heuristic.72matched pairs/144games:0improvements,1regression(-23),71unchanged. Rejected.
- `funded-terminal-matched.mts`: joint terminal frontier includes cash from a sale, affordable bid ceiling, and both final payout outcomes.72matched pairs/144games:5improvements,0regressions, mean+0.236points, unchanged wins. This promising initial result required untouched validation.
- `score-100-final-holdout.mts`:144new matched pairs/288games, using the actual frozen330d6a7 terminal solver for the control and opponents. Candidate combines constrained-letter search and funded terminal actions. Mean79.0486→79.0694(+0.0208,SE0.0424);3improvements,1regression,140unchanged;25.5tie-adjusted wins each. No significant scoring benefit established. Funded actions remain experimental and are not imported by the live worker.

## Improved recursion

The terminal solver now branches on the remaining letter with the fewest legal consuming words. Every packing either omits one copy of that letter or contains a word consuming it; both branches are covered. An unused letter with zero compatible words can be removed entirely. Memoization, greedy feasible lower bounds,3xface-value upper bounds, exactness labels, anagram deduplication and the18ms/8000-node runtime budget remain.

`constrained-recursion.mts` compares the old solver frozen from330d6a7 and the revised solver on256demanding10/12/14/16-tile racks from the official bag, alternating execution order. Under the same18ms/8000-node limits, completed proofs rose180→249;69new-only completions,0old-only. Mean query time fell8.07→2.49ms. Every jointly solved rack had the identical optimum. These demanding racks do not represent the distribution of final racks in live six-player games; this is search-completeness evidence, not a claimed average match-score gain.

All90behavioral, exact-rule, independent packing and worker/runtime tests pass, as does TypeScript. The new terminal funding frontier only returns fully certified choices that preserve the losing-tile payout. Its opponent-bid model uses public balances as possible bid ceilings and is an assumption, not access to opponents' bids. The holdout shows why this model should not replace the live policy yet.

## Reproduction and provenance

Portable runners and complete paired reports are alongside this document. Historical search reports contain the source hashes actually loaded at their start; later new helper methods and the constrained solver do not retroactively change those results. For exact historical parameter-search reproduction, copy its runner to a checkout of330d6a7; it requires only that revision's APIs. The frozen terminal source in `fixtures/terminal-before-score100/` is330d6a7's file with relative imports rewritten to this repository's unchanged licensed core/adapter APIs. The final holdout explicitly uses that frozen source for its control/opponents.

The licensed core, parameters and license are untouched. No live hidden bids, opponent-private racks, credentials, or future bag contents were read. The tournament process was left running without a restart or strategy change during its matches.
