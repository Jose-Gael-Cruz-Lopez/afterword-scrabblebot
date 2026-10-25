# Exact terminal payout plus last-tile denial: final matched validation

Candidate composition: `LastTileDenial(ExactTerminalStrategy(GauchoReference({terminalSafe:true}), {timeBudgetMs:18,maxNodes:8000}))`. The inner bid is always called before denial overrides its amount, priming the exact wrapper's pre-purchase feasible plan. No existing runtime or policy file was edited by this experiment.

Control: current licensed `GauchoReference({terminalSafe:true})`. Both arms use unchanged production parameters and public learned market table. Candidate changes only final liquidation and the penultimate bid.

Validation used 48 new matched scenario pairs (96 games), 24 per auction mode. The same seed, seat and opponent policies were used for each pair. Each focal policy occupied every seat four times per mode. Three competitive rosters included licensed clones/mutants, price-pressure bots and a patient seven-letter policy. The report records SHA256 source hashes; its exact-wrapper hash matches the final tested source with monotone floor caching.

- Both policies: **21.5/48 tie-adjusted wins (44.79%)**, mean score **87.90**, mean rank **1.917**.
- Vickrey: **8/24 wins each**. First-price: **13.5/24 wins each**.
- All 48 focal score/win/rank outcomes were identical. Own-score regressions: **0**.
- Candidate changed **20 penultimate bids** and **8 auction winners**.
- Invalid actions: **0**. Pre-penultimate trace differences: **0**.
- Candidate decision mean **0.438ms**, maximum **5.09ms**; control **0.452ms**, maximum **5.01ms**.
- Four denial wrapper tests plus ten exact-wrapper tests passed, including preserved payout after an unwanted tile and exhausted exact-search budget. Build passed.

This validation supports compatibility and no observed regression on the sampled games. It does **not** demonstrate increased win rate. Exact terminal correctness gains are separately proven by targeted real-dictionary and exhaustive small-rack tests; those targeted cases were not used as random matched validation wins.

Reproduce from the repository root:

```sh
bot-starter/node_modules/.bin/tsx docs/experiments/exact-denial-combo.mts
```

Full paired results and source hashes: `exact-denial-combo-report.json`.
