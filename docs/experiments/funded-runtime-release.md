# Controlled live trial: funded clearing-price bidding

Afterword's live losses include high-cost acquisitions that strand capital in
unfinished words. This release compares the final funded consequences of buying
versus passing, rather than treating a letter's immediate potential as spendable
value. It changes only literal `SecondPrice` bidding with 3–16 auctions left.
No hidden rival racks/bids or actual future draws enter the policy.

The runtime factory packages the exact `refresh16-full` candidate: four common
samples, 16 current rival-threshold quantiles, 70 ms model budget, risk penalty
0.5, improvement margin 0.5 and strength 1. Hypothetical dictionaries refresh
after three acquisitions and after cashouts. Future rival thresholds use the
fixed public completed-game prior without capping by present cash, since future
cashouts can replenish capital. The factory's explicit configuration is essential;
the bare clearing-bidder defaults are a different, rejected candidate.

The actual word policy remains `LastTileDenial(ExactTerminalStrategy(Gaucho))`,
with the same 18 ms / 8,000-node exact terminal bound. `BOT_POLICY=licensed`
remains the default and rollback. `BOT_POLICY=funded` enables this controlled
trial. `original` remains available. Vendored MIT core, parameters and attribution
are unchanged.

## Evidence

Three independent holdouts used identical fixed candidate parameters and paired
seeds/seats with opponents reacting to every changed result:

| Cases | Mean-score change | Fractional control → candidate wins |
| --- | ---: | ---: |
| 52 | +0.615 | 14.5 → 17 |
| 104 | +1.260 | 21.5 → 25.5 |
| 252 | +0.802 | 56.5 → 60.833 |

The largest set has score SE 0.408 and win-rate change +1.72 percentage points,
SE 1.68 points. It contains 126 six-player and 126 seven-player cases with all
seats crossed against three rosters. Its all-clones subset loses two wins while
mixed/pressure fields improve. Model fallback occurs on 8.86% of eligible calls;
maximum observed total decision time is 72.55 ms. There were no invalid actions.
These are modest simulated gains, not a guaranteed live win rate. The official
leaderboard still had Afterword eighth at 2065 ±89 before this trial, versus
Waupus first at 2329 ±68 (2026-10-25 08:35 UTC snapshot).

The three `rollout-bid-clearing-refresh*` runners and their reports preserve the
selection rule, frozen configurations, seeds, complete outcomes and source hashes.
The long confirmation/review also preserve nine positive/negative full traces.
The model's training fixture and fitter are public ended-match observations;
held-out reactive games never supplied actual future thresholds to the policy.

## Runtime parity and synchronization

An explicit own seat now travels with live snapshots, matching simulation
contexts. Public played words are included with conservative time ordering;
equal-timestamp awards count as already available, and unsold awards use an
undefined winner. No new private subscriptions are added. These fields do not
enable experimental public-initial-rack deductions in this release.

A post-confirmation cache fix includes public player seat, balance and score.
Previously a same-auction rival cashout could trigger a fresh snapshot while
reusing a bid computed before that cashout. The regression test changes only a
rival's public cash/score and checks recomputation. Simulation decisions have one
fixed public snapshot per phase, so this does not alter the confirmed policy.

Semantic parity tests use a fixed test clock to avoid comparing one timed-out
call with another completed call under parallel CI load. Independent deadline
fallback tests and the real planner-worker integration retain the real clock.
The real worker test verifies `funded` startup, affordable integer bids, all-bank
last-usable bidding and zero bidding on the final unusable award.

Reproduce tests/build with `npm test --prefix bot-starter` and
`npm run build --prefix bot-starter`. Full gameplay reproduction:
`bot-starter/node_modules/.bin/tsx docs/experiments/rollout-bid-clearing-refresh-long-confirmation.mts`.

Live trial activation and subsequent results must be recorded separately;
offline confirmation alone does not establish first place.
