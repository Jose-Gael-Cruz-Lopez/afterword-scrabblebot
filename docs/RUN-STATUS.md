# Afterword operating status

Registered on2026-10-24 as Afterword, bot145, team Afterword by Jose(team139), owned by the signed-in SpacetimeDB account. Public profile: https://scrabblebot.spacetimedb.com/bots/145 .

A scoped live client runs under the user LaunchAgent dev.afterword.scrabblebot. It automatically reconnects and restarts, joins casual matches, and registers/stays free when an open tournament appears. At the latest explicit check, the tournament table was empty; tournament participation is not yet confirmed. No tournament win is claimed.

Live matches16264,16274 and16284 were observed through completion against real bots: scores81,23 and59; best finish tied second. These live results are less strong than the synthetic benchmark, so further changes must be evaluated against competitive acquisition pressure. A full-history subscription issue was found in live operation and corrected: RSS fell from~2.1GB to~335MB, with scoped histories released at each completed game.

Credentials are stored locally outside tracked files with0600 permissions. Logs are ignored by Git. The bot runs on this Mac, not a remote server. Keep the Mac and its network available. Stop/restart commands are in the README.

Evidence: 43 passing tests;216 simulated tuning matches without illegal actions; scoped-subscription live query probe; real worker termination/recovery; registration screenshot; live score summaries. Parameter experiments and simulations do not guarantee competition wins.
