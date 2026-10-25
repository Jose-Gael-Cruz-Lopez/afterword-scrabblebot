# Afterword: diagnosis from seven completed live matches

This is a read-only diagnosis of matches **16341, 16351, 16361, 16371, 16380, 16390 and 16399**, ending at 2026-10-25 06:33:59 UTC. All seven are second-price/Vickrey games. Every match was verified ended before its auction history and post-match winning-bid archive were queried. No live top-bid view or opponent private holdings were accessed.

**The main observed gap is productive tile conversion and rebuilding, rather than simply unused money or slow computation.** The current word policy frequently turns newly acquired ordinary letters into two-point words, while sometimes paying more for a rare tile than the whole shorter word eventually earns. Opponents obtain more valuable letters and convert them into larger payouts that finance further purchases. These are descriptive findings; a better policy still needs controlled replay/live validation.

## Exact game summary

| Match | Own rank | Own score | Winner / score | Own cash | Own acquired tiles | Own cost/tile | Own words |
|---|---:|---:|---|---:|---:|---:|---|
| 16341 | 4/6 | 45 | testbot / 112 | 8 | 10 | 13.70 | QAID, COOLER, AE, AN |
| 16351 | 5/6 | 73 | testbot / 106 | 17 | 12 | 13.00 | FESTIVE, EXEUNT, ET |
| 16361 | 4/6 | 81 | MeniceLab2 / 110 | 4 | 16 | 11.06 | EXUVIAL, GENITOR, EL, IT, AR |
| 16371 | 3/6 | 83 | MeniceLab2 / 96 | 9 | 14 | 12.43 | LOCALIZE, OVULAR, TO, AS |
| 16380 | 3/6 | 58 | Dwight / 177 | 8 | 14 | 10.71 | AIRPORT, OUTGAINS, LO, EN |
| 16390 | 4/6 | 52 | Nigel / 136 | 36 | 10 | 11.60 | EURIPI, NO, NERTZ, ET |
| 16399 | 6/6 | 27 | maverick-bot / 96 | 38 | 9 | 9.89 | ELUTION, OR, AL, LI |

All 42 participant score and cash histories reconcile exactly: `final cash = 100 + word rewards − paid prices`. All unplayed tile counts reconcile with starting five plus acquired tiles minus played tiles.

## Where the points go

| Metric | Afterword | Winners of those same games |
|---|---:|---:|
| Mean score | 59.86 | 119.00 |
| Mean end cash | 17.14 | 24.86 |
| Mean coins spent | 142.71 | 194.14 |
| Mean acquired tiles | 12.14 | 17.43 |
| Cost per acquired tile | 11.75 | 11.14 |
| Mean word length | 4.07 | 5.43 |
| Points per spent coin | 0.419 | 0.613 |
| Points per played tile | 3.68 | 5.48 |
| Mean face value per played tile | 1.56 | 2.15 |
| Reward / face-value multiplier | 2.354 | 2.547 |
| Mean unplayed tiles | 0.86 | 0.71 |

Afterword played **15 two-letter words out of 28 total words**, each earning only two points. Winners also played 28 words in total, but only eight had length two or three. Afterword obtained 58.7% of its points from seven-plus-letter words, versus 67.0% for winners.

Tile quality matters alongside length. Own played tiles average face value 1.56, versus 2.15 for winners: about 38% higher. The aggregate multiplier differs by only about 8% (2.354 versus 2.547). Together these explain the roughly 49% winner advantage in points per played tile. AIRPORT (27), OUTGAINS (27) and ELUTION (21) demonstrate that reaching seven letters is not enough when the word consists mostly of one-point letters.

## Purchase and cashout mismatches

- **16341:** bought Q for **36**, then played QAID for **21** at the next open auction. The Q alone cost 15 more than the whole four-letter payout; three other tiles were consumed too.
- **16390:** bought Z for **29**, later played NERTZ for **28**. Again, the whole word earned less than the rare tile cost.
- **16399:** played ELUTION after buying only I and N, then OR, AL and LI for two points each, with 43, 24 and 13 auctions remaining. This emptied successive rebuilding attempts into low returns.

The last example is not a proof that every short word should be forbidden. Exact dictionary packing of only the already-observed short-word letters improves the seven games by **19 points total**, or 2.71 points/game, and flips no wins. Examples: EL + IT + AR can become RETAIL (+9); OR + AL + LI can become LORAL (+4). The conditional replay can afford all original winning bid caps while postponing those small words until their final timestamp, but real opponents might react differently to changed visible scores and balances. A blanket short-word ban is therefore not a demonstrated solution.

## Acquisition and deadline evidence

Across the seven games, the median own losing positive bid is between **5 and 9**, while the median opposing archived winning bid on those same losses is **13 to 17**. In 16399 alone, 56 acknowledged positive bids lost: median own bid 9 versus median winning bid 14.5. This is direct field evidence that ordinary rebuilding caps were frequently below the competitive range. Blindly raising all prices is still unsupported; independent budget/floor stress tests failed.

There are **460 distinct acknowledged auction decisions out of 476 auctions**, and **three explicit `Auction closed` errors**. Successful logged decisions have median compute 22.6 ms and maximum 240.5 ms, against a one-second auction. These timing measurements exclude any silently discarded plans; acknowledgement time is not submission time. Missing log entries include intentional zero bids and cannot automatically be classified as deadline misses. The observed positive bids nevertheless lose far more often on valuation than on an explicit deadline error.

## What this supports testing next

Align auction valuation with the cashout plan it will actually execute: a tile should not be bought on a speculative seven-letter value and immediately liquidated into a much lower shorter-word reward. Preserve productive high-face consonants into longer plans, while allowing useful shorter payouts when capital is truly needed. Judge changes by paired historical replay and actual field outcomes; spending more money or meeting a word-length target alone is inadequate.

This report does **not** establish an optimal bid floor, a universal short-word threshold, or a tournament win guarantee. The seven-game window spans worker restarts and calibration changes, and logs do not stamp full per-match parameter snapshots. It is not a controlled comparison of one strategy version.

`live-diagnosis.json` contains exact public SQL queries, raw returned rows, audits, word timings, post-match archive comparisons, inferred own starting-rack evidence and conditional packing diagnostics. Static full-rack repacking entries intentionally ignore cash timing and are marked diagnostic only.
