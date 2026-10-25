# Licensed policy: current live diagnosis

Read-only evidence from the latest eight completed matches at capture: **16558, 16567, 16576, 16585, 16595, 16605, 16615, 16624**. Their ended states were verified before historical reads. All eight are Vickrey/second-price. Raw queries and returned public records are in `licensed-live-diagnosis.json`. No live spectator bids or opponent private racks were accessed. Runtime and vendor code were not changed.

**The strongest actionable finding is a missing joint cashout-and-bid decision under a limited bankroll.** Exact final packing alone does not solve this. A separate operational outlier also lost many auction opportunities.

## Present performance

The licensed policy won **3/8**, averaged **88.75 points** and mean place **2.0**. These are changing-opponent samples, not a strength-adjusted forecast. Compared with winners in these same games, own cash is already lower (15.25 versus19.0), word multiplier higher (2.710 versus2.659), and points per played tile similar (5.50 versus5.62). The old tiny-word cashout diagnosis no longer dominates.

| Match | Own rank | Own score | Winner / score | End cash | Unplayed rack |
|---|---:|---:|---|---:|---|
| 16558 | 2/6 | 84 | Derg / 86 | 20 | empty |
| 16567 | 2/6 | 87 | swrjlab / 89 | 11 | DW |
| 16576 | 1/6 | 99 | Afterword / 99 | 3 | empty |
| 16585 | 2/6 | 84 | Lionel / 99 | 10 | OU |
| 16595 | 1/6 | 94 | Afterword / 94 | 14 | A |
| 16605 | 3/6 | 81 | GrantBot / 97 | 19 | IO |
| 16615 | 4/6 | 72 | BlackSwan / 130 | 41 | O |
| 16624 | 1/6 | 109 | Afterword / 109 | 4 | HQ |

Own acquired tiles average12.38 versus winners13.5; acquisition cost per tile14.02 versus13.44. All48 participant score and balance histories reconcile exactly. All five own starting tiles are inferable in every game from chronological public word/award deficits, permitting exact own-rack terminal reconstruction.

## Concrete missed terminal funding branch:16615

At the last usable Y auction, Afterword held **PAIRING + O**, with **11 coins**. Both the licensed beam and independent exact search agree: before=PAIRING30; withY=PRAYING39. The actual rival winning bid was32, so11coins cannot buy that improvement. There is no beam error.

A different *joint* action is feasible under the recorded rival bids:

1. Cash PAIRING for30: bank becomes41, rack becomesO.
2. Bid41 forY: pays the rival32, bank becomes9.
3. During the final auction, cash OY for5: final score becomes**77**, versus actual72; conditional placement improves from fourth to third (tinytung74).

The unconstrained optimum39 is unattainable with11cash. The funded alternative35 beats the fallback30. A cashout rule requiring a word to belong to the optimal partition both with and without the offered tile rejects this useful financing action. **Search cashout subset → affordable bid → remaining partition together**, under sampled opponent thresholds; compare against no sale.

This is an ended-match counterfactual with historical rival bids held fixed. Changed public cash/score may cause rival responses; network timing must allow the sale and bid to commit within one second. It is evidence of a missing decision branch, not a promised live improvement.

## Cashout delay and late speculation

PAIRING30 was already provably available at auction57 with11cash, but withheld eleven auctions until68. The licensed `minPlayReward=40.551` and `lowCash=9.467` explain why a seven-letter30point word can remain unsold while the bankroll stays just above11. REMOVAL36 in16595 was also held ten auctions, but that game was won. A globally lower threshold is therefore unproven; joint cash/word/purchase rollout is more informative.

Late purchases also consume scarce endgame capital without an eventual word:

- **16567:** W21 at auction63 andD20 at64; final rackDW is unspellable. The game was lost by2points.
- **16624:** Q11 at56 andH9 at62; finalHQ is unspellable, stranding20coins of acquisition cost.

Future draws were not known at purchase. These cases support testing an earlier endgame lookahead/horizon, not retrospective rules that assume the future letter sequence.

## What terminal exactness and runtime do explain

Independent exact packing agrees with the licensed beam in **all eight last-usable positions**. Every actual residual final rack is unspellable, so these games did not lose a known final word to serial cashout/network tail. Three missed positive last-usable gains were bankroll-limited:16605 OI+S gives2but19cash loses to21;16615 gives+9but11cash loses to32;16624 HQ+E gives5but4cash loses to14.

Runtime is not uniformly clean: **20 explicit Auction closed failures** occur in the window, **14 in16567 alone**, which lost by2points. Its failure cluster spans06:54:57.414–06:55:42.300UTC, with successful acknowledgement gaps of8.8seconds and12.3seconds. Successful planner work is only2–6ms in that game (window median3.6ms, maximum31.8ms). Investigate delivery/awaited reducer progress and scheduling rather than accelerating already-small dictionary searches.

There are496 distinct acknowledged auction decisions out of544. Missing records may be intentional zero bids or other causes; they are not all deadline failures. Logged compute measures successful decisions and excludes discarded plans or network waiting.

The report makes no production changes and establishes no tournament-win guarantee. Parameter changes and terminal wrappers need matched replay and actual live outcomes, with explicit counterfactual assumptions.
