# Last usable tile denial: neutral first matched validation

The optional `LastTileDenial` wrapper delegates all word decisions and ordinary bids. In the penultimate auction (`roundsRemaining === 2`), it calls the inner bid (so an exact wrapper can prime a feasible pre-purchase floor), then bids the entire available balance. No opponent-private information is required.

The hypothesis is that remaining currency has no subsequent useful purchase, so the bot can deny an opponent's last completion even when its own rack gains nothing. Approximate terminal packing can violate score monotonicity after an extra tile; the optional exact-terminal combination is evaluated separately.

Validation: 48 fresh matched scenario pairs / 96 games, 24 pairs per auction mode, six seats evenly occupied four times per mode. Three competitive rosters included licensed clones/mutants, pressure14/16/18 and a patient seven-letter policy. Both arms used the current licensed `terminalSafe:true` word policy. Each pair had the same seed, seat and opponent policies; all pre-penultimate trace hashes were identical.

- Both policies: **17.5/48 tie-adjusted wins**, mean score **84.50**, mean rank **2.375**.
- The wrapper changed **25 bids** and **14 penultimate winners**.
- Own-score losses: **0**. Win/rank changes: **0**.
- Other players' scores changed in 9 pairs, with aggregate opponent score difference **-29**. None crossed our rank/win boundary in this sample. A seeded losing-bid tie changed which opponent won; per-seed opponent-score monotonicity is therefore not claimed.
- Invalid actions: **0**. Candidate maximum decision: **6.03ms**.

This sample demonstrates the mechanic executes and did not regress the focal bot; it does **not** demonstrate an improved win rate. No live process was changed by this experiment.

Reproduce from the repository root:

```sh
bot-starter/node_modules/.bin/tsx docs/experiments/last-tile-denial.mts
```

Full paired outcomes and source hashes: `last-tile-denial-report.json`.
