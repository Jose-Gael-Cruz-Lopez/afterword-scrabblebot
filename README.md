# Afterword — auction-aware ScrabbleBot

Afterword is Jose Cruz's bot for the Clockwork Labs ScrabbleBot competition. It competes as [bot #145](https://scrabblebot.spacetimedb.com/bots/145). This is a fork of the official MIT-licensed game/starter; the game module is unchanged. All bot changes are in `bot-starter/`.

## Strategy

- Full official ENABLE dictionary, indexed once; equivalent anagrams share one count vector.
- Bounded branch-and-bound multiword packing, so one tempting word cannot destroy two better ones.
- Explicit hold-or-play decisions, based on missing-letter completion probabilities, reward tiers, remaining auctions and working capital.
- Marginal rack valuation for sealed bids, with separate first-price shading and a rebuild floor to prevent starvation after cashouts.
- Counts only our own initial rack and public auction outcomes. No hidden opponent holdings, private bids, spectator accounts or server modifications.
- Final-auction liquidation: the last awarded letter cannot be used because the server ends the match in the same transaction.
- A worker isolates dictionary search from WebSocket events. Serialized submissions, stale-state checks, retry/backoff, reconnect recovery, and tournament auto-entry.

## Measured performance

Forty-three behavioral, exact-rule, exhaustive-search and real-worker tests pass. All 216 seat-balanced tuning matches completed without illegal actions. In the final untouched 60-match confirmation, the selected parameters won 63.33% of Vickrey matches and 83.33% of first-price matches against our prior strong variant, original planner and three completion-aware opponents. Maximum selected-policy decision time in that confirmation was 66ms. These are simulated opponents and results, not a promise of tournament wins. Full methodology/results: [benchmark-tuning.json](docs/benchmark-tuning.json), [research](docs/bot-research.md).

Selected settings: bid scale2.0, acquisition share0.6, hold margin2.5, minimum bid4, maximum spend fraction0.7, future cost1.2. Controls in the tuning runner are frozen independently of production defaults.

## Run

Requires Node24+, npm and the official SpacetimeDB CLI. Do not publish the game module; this client connects to the existing competition database.

```sh
npm install --prefix bot-starter
npm run generate --prefix bot-starter
npm test --prefix bot-starter
npm run build --prefix bot-starter
cd bot-starter
BOT_NAME=Afterword BOT_TOKEN='<your own bot token>' TOURNAMENT_ID=auto npm start
```

The first run privately saves the bot credential to `.token-Afterword` (mode0600; ignored by Git). Subsequent runs omit `BOT_TOKEN`. Tokens and nonces must never be committed. Official team/token instructions: https://scrabblebot.spacetimedb.com/docs . `TOURNAMENT_ID=auto` enters open tournaments and stays free for the event; `none` runs casual games only; a numeric ID enters that event.

Reproduce benchmarks with `npm run benchmark --prefix bot-starter`, or run `cd bot-starter && npx tsx src/tune.ts` for the tuning suite. The tuning suite takes several minutes. Dictionary startup is outside measured auction decisions.

## Current local operation

The registered bot runs under the user's LaunchAgent `dev.afterword.scrabblebot`, with automatic process restart, reconnect and idle-sleep inhibition while running. Logs: `bot-starter/logs/live.log` and `error.log` (ignored). It requires this Mac and its network connection; it is not a cloud deployment.

```sh
# Inspect the supervisor:
launchctl print gui/$(id -u)/dev.afterword.scrabblebot
# Stop and remove it from this login session:
launchctl bootout gui/$(id -u)/dev.afterword.scrabblebot
# Start it again:
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.afterword.scrabblebot.plist
```

[Official project and API documentation continue below.](#scrabblebot)

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
