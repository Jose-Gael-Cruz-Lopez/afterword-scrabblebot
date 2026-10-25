# Licensed-policy terminal correction: matched verification

Run from the repository root after installing `bot-starter` dependencies:

```sh
bot-starter/node_modules/.bin/tsx docs/experiments/gaucho-terminal-safe-matched.mts
```

The runner uses relative repository imports and writes
`gaucho-terminal-safe-matched-report.json` beside itself. It does not connect to
a server or read credentials. The report records SHA-256 hashes of the adapter,
simulator, original-policy opponent, word engine, upstream manifest, licensed
core, parameters and license. Before running, it verifies the vendored files'
Git blob hashes against `reference-gaucho/UPSTREAM.json`.

The upstream source and weights come from the MIT-licensed Gaucho repository at
commit `f2dce03a99e01a88ef9fdf2e300b50ef592c4c50`. They remain unchanged.
The correction exists only in the local adapter, and `terminalSafe` remains
**false by default**. Both flags are explicit in this experiment.

## Counterfactual comparison

The experiment uses 24 fresh seeds, `2026110101` through `2026110124`. Each seed
runs twice: first with the candidate's `terminalSafe:false`, then with
`terminalSafe:true`. The five opponents, candidate seat, shuffled bag, hidden
starting rack, auction mode and all other parameters stay identical. The
candidate occupies every seat four times. All games use Vickrey auctions, six
players, five starting tiles and the authoritative ENABLE dictionary.

Opponents are another untouched licensed policy, the corrected original policy,
and three fixed-price bidders at 14/16/18. The original-policy opponent has
explicit parameters: bid scale 2, minimum bid 4, maximum spend fraction 0.7,
acquisition share 0.6, hold margin 2.5, future cost 1.2, market rebuild false.

With this configuration the last usable auction is round 67 and the unusable
final auction is round 68. For each pair, the runner compares **every word and
bid event before round 67**, confirming the entire earlier game is identical.
It then records the candidate's terminal events and final score in both runs.

The adapter sells a word before the last useful purchase only if bounded exact
search certifies both equalities:

- word reward + optimal remaining-rack score = optimal current-rack score;
- word reward + optimal remaining-rack score with the current tile = optimal
  current-rack score with that tile.

A timeout does not certify a sale. With cash and no certified independent word,
the opt-in holds the rack. With zero cash, it can sell a legal word to fund a
purchase. The final auction still liquidates normally. Separate adapter tests
check the two equalities with an independent exhaustive small-rack solver.

## Initial matched result

The original completed run is preserved unchanged as
`gaucho-terminal-safe-matched-original-report.json`:

- 24 paired seeds / 48 games; zero illegal actions.
- Every pre-terminal prefix identical.
- 2 positive score changes, 22 unchanged, 0 negative changes.
- Mean score 92.542 with the correction versus 92.208 untouched.
- One pair holds `LAR` and buys `H`, then plays `HARL`: +7 points.
- One pair holds `AR` and buys `E`, then plays `ARE`: +1 point.

This is modest positive score evidence; it does not prove a broader win-rate
improvement against the live leaderboard.

`gaucho-terminal-safe-roster-report.json` preserves an earlier different-seat
comparison where safe and untouched bots played in the same game. Its 6 versus
17.5 weighted wins are **not a causal comparison**: the two policies received
different private starting racks. The matched experiment was added to isolate
the terminal correction from that confound.

The adjacent generated report is a fresh reproduction with current source
hashes. Original source/reference benchmark reports elsewhere in the repository
have not been modified.
