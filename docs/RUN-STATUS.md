# Afterword operating status

Snapshot: 2026-10-25T07:14:19.552832+00:00. Registered bot **Afterword145**, team **Afterword by Jose139**, owned by the signed-in SpacetimeDB account. [Public profile](https://scrabblebot.spacetimedb.com/bots/145).

## Running policy

The user LaunchAgent `dev.afterword.scrabblebot` runs the MIT-licensed Lionel/Gaucho production policy (pinned source and attribution in `bot-starter/src/reference-gaucho/`), through our worker/client, explicit terminalSafe adapter, exact terminal partition wrapper and last-useful-tile denial. Bid acknowledgements from an old auction no longer block new auctions. It automatically reconnects/restarts, joins casual matches, and registers/stays free when an open tournament appears. Tournament1 is now **Registration**. Afterword automatically registered as entry14 at2026-10-25T07:06:50Z (00:06:50PDT); the public database confirms bot145, tournament1, eliminated=false. The bot finished its casual match16660 and is staying free for the tournament. No tournament win is claimed.

The licensed policy replaced the weaker original after match16456. A verified live win followed: **match16502, Afterword131, Jobs90, Lala89, bot69, swanbot54, ace_bot44**. The public database confirms an ended six-player Vickrey match. At this snapshot the licensed client has 7 completed observed games and 2 win(s); these few casual outcomes are not a stable win-rate estimate. [Public match](https://scrabblebot.spacetimedb.com/matches/16502), [query evidence](evidence/live-win-16502.json), [all licensed results at snapshot](evidence/licensed-live-summary.json).

The original planner had no observed live wins. Early matches16264/16274/16284 scored81/23/59 (best tiedsecond), and the seven-match diagnosis remains in `experiments/live-diagnosis.md`. We retained the negative evidence instead of inferring strength from weak simulated opponents.

A full-history subscription problem was fixed: the original process reached~2.1GB RSS; the scoped licensed client was observed near114MB. Active-match histories are released on completion. Dictionary search runs in a worker; match planners are isolated. Recent licensed decisions are typically a few milliseconds, but network timing still matters.

## Validation

83/83 tests pass; TypeScript build passes. Final fresh seat-balanced confirmation: reference10/12 Vickrey wins and7/12 first-price wins, original2/12 and3/12, zero invalid actions. The final terminal correction has independent small-rack invariants and24 paired seeds /48 runs:2 improvements (+7,+1),22 unchanged, zero regressions; all pre-terminal traces match. Full provenance and portable runners are committed. A further96-game exact+denial comparison had zero regressions but equal wins/scores;408 static tuning games failed to justify parameter changes. These results do not guarantee tournament strength.

## Operation and privacy

The bot runs on this Mac, not remotely. Keep the Mac awake with its network available; the LaunchAgent includes idle-sleep inhibition. Credentials are private0600 files and are ignored by Git, as are operational logs. Stop/restart commands are in the README. The official competition module was not changed or republished, and the bot never accesses hidden opponent holdings or live spectator bids.

## Current upgrade validation

The latest eight licensed casual games in the diagnosis had3wins and mean finishing place2.0. The remaining documented gaps include auction-response stalls and financing a last purchase. Exact packing did not explain those eight outcomes, so the new exact search is described as protection against demonstrated counterexamples rather than a claimed cause of current losses. The broad cashout/spending changes were rejected. See `experiments/licensed-live-diagnosis.md`, `experiments/licensed-tuning.md` and `experiments/exact-denial-combo.md`.
