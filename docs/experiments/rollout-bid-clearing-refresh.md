# Refreshed funded-continuation purchase valuation

This separate offline candidate extends clearing-price-integrated bidding from
the last ten auctions to the last sixteen. It refreshes the hypothetical local
dictionary after three purchases or a cashout. The earlier model retained words
within three missing tiles of its initial hypothetical rack; that can omit new
targets created by funded purchases or newly available leftovers. Refreshes are
cached by rack across cost evaluations. The actual word policy is unchanged.

The candidate uses four common future scenarios, sixteen quantile strata for
current clearing prices, the fixed public rival-winning-threshold prior for
future prices, and a shared 70 ms deadline. It optimizes integrated own-score
gain against the normal bid with a 0.5 point plus 0.5 SE threshold. Incomplete
valuations return the normal control bid. Current hidden rivals' holdings, actual
future tiles and actual rival thresholds are never supplied.

Two prespecified bid blends (full and half) were trained on 26 balanced
six/seven-player Vickrey paired cases, seeds derived from 3670000211. Both showed
the same win and mean-score change. The prespecified selector froze
`refresh16-full` before 52 untouched cases, seeds derived from 3930000223. The
control is current exact+denial licensed production; rivals use the same strong
three heterogeneous rosters as the earlier funded experiments. Total: 182 games
and zero invalid actions.

| Initial untouched holdout | Control | Candidate | Paired change |
| --- | ---: | ---: | ---: |
| Mean score, 52 games | 74.98 | 75.60 | +0.62, SE 1.28 |
| Tie-adjusted wins | 14.5 | 17 | +4.81 pp, SE 4.40 pp |
| Mean rank | 2.750 | 2.692 | −0.058 |
| Maximum decision time | 5.55 ms | 72.15 ms | |

Scores increased in 16 cases and decreased in 15. This is a **weak positive
screen, not deployment evidence**: both effect sizes remain smaller than their
uncertainty, and model-budget expiry needs measurement. The setting is frozen;
no further parameter tuning is permitted on its holdout.

An additional fixed 104-pair/208-game pilot, with four fully crossed rosters
including all current production clones, was launched immediately before the
parent requested a larger confirmation. It uses independent seeds derived from
401000009 and is retained under `rollout-bid-clearing-refresh-confirmation`.
It is not selection data.

The fixed pilot completed with zero invalid actions:

| Independent pilot | Control | Candidate | Paired change |
| --- | ---: | ---: | ---: |
| Mean score, 104 cases | 74.75 | 76.01 | +1.26, SE 0.47 |
| Tie-adjusted wins | 21.5 | 25.5 | +3.85 pp, SE 1.77 pp |
| Mean rank | 2.923 | 2.894 | −0.029 |
| Maximum decision time | 12.71 ms | 71.76 ms | |

Six-player cases improved +1.73 points and +2.5 wins across 48 cases;
seven-player cases improved +0.86 points and +1.5 wins across 56 cases. Scores
increased in 33 cases and decreased in ten. Of 1,446 modeled decisions, 1,325
completed and 121 expired to control (8.37%). There were 181 changed bids: 68
raised and 113 lowered. This is favorable replication but remains one of many
researched candidates; independent larger confirmation still determines the
recommendation. The all-clones subset had a nearly flat score change (−0.04)
with +1.5 wins across just 26 cases, so it does not establish broad dominance.

The requested independent confirmation is separately named
`rollout-bid-clearing-refresh-long-confirmation`: 252 new Vickrey pairs/504
games, seeds derived from 721000019, 126 six-player and 126 seven-player cases.
Three opponent rosters (all current production clones, production mutants, and
production with pressure-14/16/18) are fully crossed with all seats and seven
six-player or six seven-player repetitions. It records modeled/completed/expired
decisions, changed/raised/lowered bids, performance, per-count/roster outcomes,
before/after source hashes, and sample positive/negative win-flip and score-loss
traces. The setting and source helpers are frozen before this run. The research
context now includes the actual own seat explicitly, matching simulation and
the parent runtime-parity correction.

No production files, deployment, process or account settings were changed by
this experiment. Final confirmation evidence must determine whether it should
be considered further; the initial positive screen is not a promise of wins.
