import { test } from "node:test";
import assert from "node:assert/strict";
import { credentialQueries, coreQueries, matchQueries } from "./runtime-subscriptions.js";

test("identity bootstrap requests only its own credential", () => {
  assert.deepEqual(credentialQueries("a".repeat(64)), [`SELECT * FROM bot_credential WHERE identity = 0x${"a".repeat(64)}`]);
  assert.throws(() => credentialQueries("bad identity"));
});
test("core subscriptions scope historical matches, lobby memberships and entries to this bot", () => {
  const queries = coreQueries(145n);
  for (const table of ["match_participant", "lobby_member", "tournament_entry"]) {
    assert.ok(queries.some(query => query === `SELECT * FROM ${table} WHERE bot_id = 145`));
  }
  assert.ok(queries.some(query => query.startsWith("SELECT match_state.*") && query.includes("match_participant.bot_id = 145")));
  assert.ok(queries.every(query => !/^SELECT \* FROM (auction|auction_result|word_play|my_rack)(?:$|\s)/.test(query)));
});
test("large histories always have a match filter and word play is also private to our bot", () => {
  const queries = matchQueries(16264n, 145n);
  for (const table of ["auction", "auction_result", "my_rack"]) {
    assert.ok(queries.includes(`SELECT * FROM ${table} WHERE match_id = 16264`));
  }
  assert.ok(queries.includes("SELECT * FROM word_play WHERE match_id = 16264 AND bot_id = 145"));
  assert.ok(queries.every(query => !query.includes("visible_auction_top_bids")));
  assert.throws(() => matchQueries(-1n, 145n));
});
