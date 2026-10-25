# Afterword — live auction ScrabbleBot

Afterword is Jose Cruz's registered [bot #145](https://scrabblebot.spacetimedb.com/bots/145), owned by team Afterword by Jose. This public fork retains the official MIT-licensed game/starter; the competition module is unchanged.

## Selected policy and attribution

The default live policy is the **MIT-licensed Lionel/Gaucho policy by Joaquin Giorgis**, pinned at [f2dce03](https://github.com/JoaquinGiorgis/scrabblebot-gaucho/tree/f2dce03a99e01a88ef9fdf2e300b50ef592c4c50). Its original core, production parameters, public market-price table and copyright notice are retained unchanged in [reference-gaucho](bot-starter/src/reference-gaucho/README.md). We selected it after direct comparisons; we do not claim authorship of that policy.

Our client supplies the official 172,820-word ENABLE dictionary, private initial rack, public auction history and correct match horizon. Per-match planners share a precompiled typed-array dictionary. An isolated worker keeps WebSocket processing responsive; serialized submissions, stale-state checks, reconnect recovery and scoped subscriptions keep the client reliable. It never reads hidden opponent holdings or live spectator bids.

Our final-auction adapter preserves useful last-purchase combinations. With one usable purchase remaining, it sells a word only when exact bounded search certifies that both winning and losing the current tile retain the optimal partition value. It holds other combinations while cash remains; zero-cash fallback can fund a last purchase. The adapter option is explicit in the live worker, and defaults off in untouched reference benchmarks. The final awarded tile is unusable because the server ends the match atomically.

The original Afterword word engine and policy remain available with `BOT_POLICY=original`. Monte Carlo, global price floors and adaptive market experiments remain research only: their controlled results did not justify deployment.

## Evidence and limits

- **64 tests pass**, including independent exhaustive packing checks, exact auction-rule simulation, adapter invariants, scoped subscriptions and real worker termination/recovery. Typecheck passes.
- In a final fresh, seat-balanced 24-game confirmation, the untouched licensed reference won **10/12 Vickrey** and **7/12 first-price** games against the original candidate and four completion-aware opponents. The original won 2/12 and 3/12 respectively. Zero invalid actions. [Runner and results](bot-starter/src/reference-gaucho/final-confirmation.json).
- A matched 24-seed / 48-run comparison isolated our terminal adapter: **2 score improvements, 22 unchanged, zero regressions**, with identical pre-terminal histories. [Methodology](docs/experiments/gaucho-terminal-safe-methodology.md).
- **Two verified live wins:** match16502 scored131 (runner-up90); match16511 scored147 (runner-up97), both against five real opponents. Earlier live losses are preserved in the [operating report](docs/RUN-STATUS.md) and [diagnosis](docs/experiments/live-diagnosis.md). Synthetic win rates do not establish a live or tournament win rate.

Research covers the official game, auction-specific public bots, Macondo, Quackle, Wolges and MAGPIE. [Research notes](docs/bot-research.md), [failed experiments](docs/experiments/RESULTS.md), [policy decomposition](bot-starter/src/reference-gaucho/benchmark-cross-results.json). Only appropriately licensed code is included.

## Run

Requires Node24+, npm and the official SpacetimeDB CLI. Connect to the existing competition database; do not publish the game module.

```sh
npm install --prefix bot-starter
npm run generate --prefix bot-starter
npm test --prefix bot-starter
npm run build --prefix bot-starter
cd bot-starter
BOT_NAME=Afterword BOT_TOKEN='<your own bot token>' TOURNAMENT_ID=auto npm start
```

The first run privately saves the bot credential to `.token-Afterword` (mode0600, ignored). Later runs omit `BOT_TOKEN`. [Official credential instructions](https://scrabblebot.spacetimedb.com/docs). `TOURNAMENT_ID=auto` registers for open tournaments and stays free for them; `none` plays casual matches; a numeric ID selects that event. No open tournament existed at the last recorded check, so tournament entry is not yet confirmed.

Run the final comparison from `bot-starter/` with `node --import tsx src/reference-gaucho/final-confirmation.ts`. The original tuning suite is `npx tsx src/tune.ts`; its controls are frozen independently of production defaults. Dictionary startup is outside measured auction latency.

## Local operation

The bot runs under LaunchAgent `dev.afterword.scrabblebot`, with automatic process restart, reconnect and idle-sleep inhibition. Logs in `bot-starter/logs/` are ignored. **This Mac and its network must remain available; this is not a cloud deployment.**

```sh
# Inspect:
launchctl print gui/$(id -u)/dev.afterword.scrabblebot
# Stop:
launchctl bootout gui/$(id -u)/dev.afterword.scrabblebot
# Start:
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.afterword.scrabblebot.plist
```

[Official project and API documentation continue below.](#scrabblebot) The preserved upstream README contains one stale rule: current server code consumes unbid tiles rather than returning them to the bag.

---

# ScrabbleBot

A Scrabble-style auction game where AI bots compete for letters.

Each round the module reveals one letter from a shared Scrabble bag and runs a
1-second sealed-bid auction. The highest bidder wins the letter, adds it to
their rack, and pays (Vickrey or first-price). Bots play words from their
collected letters at any time to earn currency, which funds future bids. Long
words pay a superlinear bonus, so hoarding is rewarded.

Built on [SpacetimeDB](https://spacetimedb.com): rules, timing, lobby
formation, dictionary — all inside a TypeScript module. Bots are external
SpacetimeDB clients (any language); the spectator UI is a Vite + React app.

Live at **[scrabblebot.spacetimedb.com](https://scrabblebot.spacetimedb.com)** ·
Bot-writing docs: **[/docs](https://scrabblebot.spacetimedb.com/docs)**

## Repo layout

The web client lives at the repo root (standard SpacetimeDB project shape);
the module is nested inside it.

| Path | What it is |
|---|---|
| `src/`, `index.html`, `vite.config.ts` | Vite + React spectator UI |
| `spacetimedb/` | TypeScript module — schema, reducers, scheduled lobby + auction ticks, dictionary |
| `bot-starter/` | TypeScript starter bot — fork & edit `src/strategy.ts` |

## How a match comes together

There's a single rolling **lobby** that's always open for 60 seconds at a
time:

- Real bots `join_lobby()` at any time.
- If 6 real bots join → match starts immediately.
- If the timer expires → match starts with whoever's there, padded out to 6
  with idle simulated bots.
- A fresh lobby opens the moment the previous one resolves.

This means matches run continuously without anyone having to manually
schedule them. Bots that finish a match just call `join_lobby()` again.

## The rules

- **Auction:** 1-second sealed-bid window per letter. Highest bid wins; ties
  are broken at random.
- **Payment:** Vickrey by default (winner pays the runner-up's bid; reserve
  1). First-price is configurable per lobby.
- **Currency:** start at 100 per match. Reward for a word = base score ×
  length multiplier (1.0× ≤3 letters → 3.0× ≥7 letters). Reward goes into
  both `balance` (spendable) and `score` (ranking).
- **Letters:** standard 98-tile Scrabble bag (no blanks). Match ends when the
  bag empties. Tiles nobody bids on go back to the bag.
- **Visibility:** `Holding` and `BagLetter` are private. Bots see only their
  own rack via the `my_rack` view; nobody can subscribe to the full bag
  composition. The spectator reconstructs opponents' racks from public
  `AuctionResult` + `WordPlay` events.
- **Dictionary:** the public-domain
  [ENABLE](https://en.wikipedia.org/wiki/Moby_Project#ENABLE) wordlist
  (~173k words), embedded from `spacetimedb/wordlist.txt`. Swap in TWL or
  SOWPODS if you have a license.
- **Rating:** the leaderboard ranks by OpenSkill (Plackett-Luce), shown on
  an Elo-like scale where new bots start at 1500, with a ± for how unsure
  it is. A bot is provisional, without a rank, until its ± is within 175.
  It updates at every match end. An Elo rating (K=32) is kept alongside it.
  A team can start a new version of its bot to start the rating over.

## Writing a bot (5-minute version)

Three steps end-to-end:

1. **Get a token** — on the live site, link your spacetimedb.com identity at
   `/account`, then create a team at `/team/new`, then click *Generate token*
   on `/team`. You'll get a SpacetimeDB JWT bound to a credential for your
   team's bot persona (shown once).
2. **Fork the starter** and plug the token in:
   ```bash
   git clone https://github.com/clockworklabs/scrabblebot
   cd scrabblebot/bot-starter
   npm install
   npm run generate
   BOT_NAME=alice BOT_TOKEN=<token> npm start
   ```
3. **Edit `bot-starter/src/strategy.ts`** — two functions:
   - `decideBid(ctx)` — return how much to bid for the current letter.
   - `chooseWord(ctx)` — pick a word to play from your rack.

That's it. Your bot will auto-join the lobby, play in matches as they form,
and re-join after each one ends. Token is persisted to
`.token-<BOT_NAME>` after the first run.

For a deeper writeup — what's visible to your bot, the reducer API, the
SpacetimeDB connection snippet end-to-end — see **[/docs](https://scrabblebot.spacetimedb.com/docs)**.

Bots can use any language SpacetimeDB has an SDK for (Rust, C#, TypeScript).
The starter is just convenience; the reducer interface is language-agnostic.

## Running the project locally

For development work on the module or UI:

```bash
npm install
npm install --prefix spacetimedb
npm run dev
```

This launches `spacetime dev` against maincloud — auto-builds the module,
publishes it, regenerates client bindings, and starts the Vite client on
http://localhost:5173. Edit `spacetimedb/src/` and changes flow
straight through to the browser.

The maincloud database name is set in `spacetime.local.json` (defaults to
`scrabblebot`). The `init` reducer seeds a default admin and the simulated
bot pool on every fresh database init.

### Other npm scripts

- `npm run dev:local` — same flow against a local `spacetime start` server.
- `npm run publish` — one-shot publish to the configured server.
- `npm run generate` — regenerate client bindings without the watcher.
- `npm run build` / `npm run preview` — production build of the spectator.

## Tournament mode

`/admin` (admin-only) has a tournament launcher: Swiss rounds → top-N cut →
single-elimination bracket → best-of-3 finals. Match size, Swiss round
count, and top cut are configurable. Ratings are updated independently
of tournament standings.

## Known limitations

- No human play — bots only.
- Token-recovery for bots is via the *rotate* model: mint a new credential
  on `/team` and the old token keeps working in parallel. The bot persona
  itself survives.

## License

MIT.
