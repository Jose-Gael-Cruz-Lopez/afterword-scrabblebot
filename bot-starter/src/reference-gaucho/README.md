# Licensed Lionel/Gaucho competitive reference

Vendored pure policy from [JoaquinGiorgis/scrabblebot-gaucho](https://github.com/JoaquinGiorgis/scrabblebot-gaucho), pinned at commit `f2dce03a99e01a88ef9fdf2e300b50ef592c4c50`.

The original `core/{policy,dict,prices,rules}.ts`, production first/second-price parameters and public learned `market-paid.json` are copied unchanged. `UPSTREAM.json` records the original source paths and Git blob identifiers. The upstream MIT license and copyright notice are retained in `LICENSE`. This is an attributed external reference policy, not original Afterword work.

`adapter.ts` connects the upstream policy to our own simulator/PlanningContext and compiles a caller-supplied dictionary into its original typed-array layout. It captures the original private rack before any cashout, subtracts public auction letters from the unseen distribution, supplies the public market-price table, and maps our inclusive `roundsRemaining` to upstream's exclusive `auctionsLeft`.

The adapter returns the first word of the upstream `chooseWords` list, allowing the client to confirm a successful word transaction before deciding again. Optional opponent public racks can be supplied as `opponentRacks`; otherwise the upstream's small denial-bid term is unavailable and skipped. The simulator does not expose opponent-private racks, and the adapter never fabricates or reads them.

Construct a fresh reference for each match. Dictionary arrays are shared read-only between instances. The live worker selects this licensed policy by default, with an explicit `terminalSafe:true` adapter option, then composes `LastTileDenial(ExactTerminalStrategy(base))` for the final usable purchase and liquidation. `BOT_POLICY=original` selects the separate original Afterword policy. The reference adapter defaults `terminalSafe:false` so untouched upstream comparisons remain reproducible. The opt-in only changes the last usable auction: exact bounded partition search certifies an independent cashout in both possible tile outcomes, otherwise positive-cash racks are held. Its paired evaluation is documented in `docs/experiments/gaucho-terminal-safe-methodology.md`.

## Reproduced local comparisons

The frozen original Afterword candidate used `bidScale=2`, `minimumBid=4`, `maximumSpendFraction=.7`, `marketRebuild=false`, plus its terminal-auction corrections. The reference used untouched upstream production parameters and public learned market table. These are simulator results, not live win-rate claims.

- `benchmark-results.json`: 24 fresh, evenly seat-balanced games per auction mode, six players total (original, reference, pressure14/16/18 and patient7). Second-price reference won 21/24 versus original 1/24, with mean scores 116.42 versus 62.33. First-price reference won 16/24 versus original 4/24, with mean scores 83.42 versus 69.13. Zero invalid actions.
- `benchmark-cross-results.json`: 24 further fresh, evenly seat-balanced second-price games separating bid/word policies. Full reference won 17/24, original bid/reference word 4/24, reference bid/original word 2/24, full original 1/24. Mean scores respectively 100.79, 76.75, 75.33, 55.63. Zero invalid actions.

Reproduce from `bot-starter/`:

```sh
npm run build
node --import tsx --test src/reference-gaucho/adapter.test.ts
node --import tsx src/reference-gaucho/benchmark-reference.ts
node --import tsx src/reference-gaucho/benchmark-cross.ts
```

- `final-confirmation.json`: 12 further fresh, seat-balanced games per mode, explicitly `terminalSafe:false`; reference10/12 Vickrey and7/12 first-price wins, original2/12 and3/12. Zero invalid actions. Run `node --import tsx src/reference-gaucho/final-confirmation.ts`.

## Afterword endgame extensions

`terminal-exact.ts` is original Afterword code; vendored core/params remain unchanged. It deduplicates anagrams in the terminal search, certifies complete bounded partition solutions, caches suffixes and preserves a feasible pre-purchase payout floor. The outer `src/last-tile-denial.ts` spends otherwise valueless terminal cash to deny a final useful tile, and calls the inner bid first to preserve the floor. Earlier policy decisions are unchanged. See `docs/experiments/exact-denial-combo.md`:48fresh matched pairs, zero regressions, equal wins/scores. This is a correctness/rank-opportunity extension, not an established win-rate improvement. `liquidity.ts` remains experimental and is not used by the worker.
