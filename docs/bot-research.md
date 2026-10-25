# ScrabbleBot research and engine design

Research checked against primary repositories on 2026-10-24. No engine ranking
here is a claim that this bot is unbeatable; strength must be measured against
real opponents and reproducible offline baselines.

## This is an auction game, not board Scrabble

The [official repository](https://github.com/clockworklabs/scrabblebot) includes
the actual rules, a starter client and the authoritative ENABLE wordlist. Its
README describes an older Rust implementation; current game code is TypeScript.
The reusable client/reducer structure is more relevant than a board-game engine.

Current source: [game.ts](https://github.com/clockworklabs/scrabblebot/blob/main/spacetimedb/src/game.ts),
[reducers and views](https://github.com/clockworklabs/scrabblebot/blob/main/spacetimedb/src/index.ts),
[letters and rewards](https://github.com/clockworklabs/scrabblebot/blob/main/spacetimedb/src/letters.ts).
Important details include private starting racks, configurable auction timing,
randomized tied bids and immediate match termination when the bag empties. An
external bot must play its remaining words before the last auction closes: it
cannot monetize the final awarded tile. Live top bids are intentionally hidden
from competitors; historical top bids become available after match end.

The exact reward is integer-floor face value times 1x for 2–3 letters, 1.5x for
4, 2x for 5, 2.5x for 6 and 3x for 7 or more. A longer word is not always the
highest-scoring word, and the highest-scoring single word can block a better
sequence of words. Words consume tiles, but do not interact with board squares.

## Engines investigated

| Project | Relevant techniques | Adaptation required | License |
| --- | --- | --- | --- |
| [Macondo](https://github.com/domino14/macondo) | Monte Carlo rollouts, opponent inference, minimax/endgame search | Board rules and ordinary Scrabble leave tables do not apply directly | [GPL-3.0](https://github.com/domino14/macondo/blob/master/LICENSE.md) |
| [Quackle](https://github.com/quackle/quackle) | Score plus leave evaluation and simulations | Fixed-rack and board assumptions differ | [GPL-3.0-or-later; some lexicons have separate restrictions](https://github.com/quackle/quackle/blob/master/LICENSE) |
| [Wolges](https://github.com/andy-k/wolges) | Compact word graphs, alphagrams, contiguous counts and cache-friendly search | Useful structural ideas; board move generation is unnecessary here | [MIT](https://github.com/andy-k/wolges/blob/main/LICENSE.txt) |
| [MAGPIE](https://github.com/jvc56/MAGPIE) | Fast native search, inference, autoplay and endgames | Ordinary Scrabble evaluation must be replaced | [GPL-3.0](https://github.com/jvc56/MAGPIE/blob/main/LICENSE.md) |
| [Official starter](https://github.com/clockworklabs/scrabblebot/tree/main/bot-starter) | Connection/authentication and legal reducers | Face-value bidding and longest-first word selection are weak baselines | MIT |

[Wolges' technical notes](https://github.com/andy-k/wolges/blob/main/details.txt)
explicitly describe alphagram DAWGs for jumbled games, compact node formats,
flat allocations and minimizing indirection. These ideas motivate a small
game-specific count index rather than importing a whole board engine. Current
engine code is an original implementation and contains no copied GPL code or
restricted tournament lexicons.

## Implemented word engine

`bot-starter/src/engine.ts` prepares the authoritative dictionary once, normalizes
ASCII words, deduplicates anagrams and stores counts, letter masks and sparse
requirements. All anagrams are interchangeable for this game's scoring; the
lexicographically first spelling provides a deterministic legal representative.
The index orders candidates by reward once at startup, so queries need no sort.

- `playable(rack)` returns legal candidates in reward order.
- `nearWords(rack, maxMissing)` reports exactly which letters and repeated counts
  are missing, including playable candidates with zero missing tiles.
- `bestPacking(rack, options)` searches legal sequences of words. Repeated words
  are allowed when enough tiles exist. A greedy feasible packing starts the
  lower bound; three times remaining face value bounds every continuation.
  Completed rack states are memoized. A node limit and wall-clock budget bound
  search; incomplete results return `exact: false` and remain legal.

Validation uses independent brute-force packing on 80 small generated racks,
duplicate tiles, expensive Q/J/Z plays, overlapping words, malformed dictionary
entries, empty racks and expired budgets. A counterexample verifies that two
seven-letter words can beat the highest-scoring single-word choice.

Local benchmark: 172,820 valid source words reduce to 156,473 anagrams. Startup
was approximately 240–379 ms. Full-dictionary playable, near-word and bounded
packing operations combined took at most 68–128 ms across sampled 6–20-tile
racks. A deliberately extreme 98-tile rack returned a feasible packing in about
69 ms with a five-millisecond *search* budget; indexing and the initial feasible
packing are outside that search budget and still have finite dictionary bounds.
These are development-machine measurements, not universal latency guarantees.
Start the index before joining a match; do not construct it inside an auction
callback.

## Strategy implications

An auction letter should be valued by the improvement to future obtainable
score, rather than face value alone. Completion candidates one to three letters
away expose potential word combinations. A useful strategy compares PLAY with
WAIT, preserves working capital, tightens liquidation near the final auction
and changes bidding between Vickrey and first-price modes. Cash has an
opportunity cost because spending it can prevent later combinations.

Live opponent data must respect the intended views. Learn from public auction
results and ended-match archives; do not use another identity to bypass the
competitor restriction on live top bids. Hidden initial racks also mean exact
remaining-bag composition cannot be reconstructed simply by subtracting public
auction letters.

Public forks provide additional reproducible baselines:
[junsooki](https://github.com/junsooki/scrabblebot/blob/main/bot-starter/src/strategy.ts)
uses native score-plus-leave search with baseline bidding;
[Phaslyr](https://github.com/Phaslyr/scrabblebot/blob/main/bot-starter/src/strategy.ts)
uses cached counts and immediate completion values. Their current revisions may
change; pin commits when recording benchmark results.
