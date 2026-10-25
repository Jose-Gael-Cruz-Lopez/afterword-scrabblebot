import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  benchmark, createCompletionBaseline, createScoreGreedyBaseline, createStarterBaseline,
  runMatch, wordReward, type SimContext, type SimStrategy,
} from "./simulate.js";

const idle = (name = "idle"): SimStrategy => ({ name, bid: () => 0, word: () => null });
const bidder = (amount: number, name = `bid-${amount}`): SimStrategy => ({ ...idle(name), bid: () => amount });
const mini = { startingTiles: 0, dictionary: ["AA"], bag: ["A", "A", "A"] };
const context = (letters: string, dictionary: string[]): SimContext => ({
  letter: "I", myBalance: 100, myRack: new Map([...new Set(letters)].map(c => [c, [...letters].filter(x => x === c).length])),
  dictionary, roundsRemaining: 10, bagRemaining: 9, round: 1, seat: 0, auctionType: "SecondPrice",
  players: [{ name: "test", seat: 0, balance: 100, score: 0 }], history: [], rng: () => 0.5,
});

test("default distribution consumes exactly 98 tiles including hidden initial racks", () => {
  const seen: SimContext[] = [];
  const match = runMatch([{ ...idle(), bid: c => { seen.push(c); return 0; } }, idle("other")], 7);
  assert.equal(match.auctions.length, 88);
  assert.equal([...match.players[0]!.rack.values()].reduce((a,b) => a+b, 0), 5);
  assert.equal([...match.players[1]!.rack.values()].reduce((a,b) => a+b, 0), 5);
  assert.equal(seen[0]!.roundsRemaining, 88);
  assert.equal(seen[0]!.bagRemaining, 87);
  assert.equal(seen.at(-1)!.roundsRemaining, 1);
  assert.equal(seen.at(-1)!.bagRemaining, 0);
  assert.equal(match.players[0]!.balance, 100);
  const letters = readFileSync(new URL("../../spacetimedb/src/letters.ts", import.meta.url), "utf8");
  const authoritative = [...letters.matchAll(/\["([A-Z])",\s*(\d+)\]/g)].map(m => [m[1]!, Number(m[2]) ] as const);
  const counts = new Map<string,number>();
  for (const p of match.players) for (const [c,n] of p.rack) counts.set(c,(counts.get(c) ?? 0)+n);
  for (const a of match.auctions) counts.set(a.letter,(counts.get(a.letter) ?? 0)+1);
  assert.deepEqual([...counts].sort(), authoritative.sort());
});

test("second price pays runner-up and a sole bidder pays reserve one", () => {
  const contest = runMatch([bidder(9), bidder(4)], 1, mini);
  assert.ok(contest.auctions.every(a => a.winner === 0 && a.paid === 4));
  assert.equal(contest.players[0]!.balance, 88);
  const solo = runMatch([bidder(9)], 1, mini);
  assert.ok(solo.auctions.every(a => a.paid === 1));
  assert.equal(solo.players[0]!.balance, 97);
  assert.equal(solo.players[0]!.score, 0, "unspent balance is not final score");
});

test("first price pays winner's actual bid", () => {
  const match = runMatch([bidder(9), bidder(4)], 1, { ...mini, auctionType: "FirstPrice" });
  assert.ok(match.auctions.every(a => a.winner === 0 && a.paid === 9));
  assert.equal(match.players[0]!.balance, 73);
});

test("zero bids consume the tile without a winner or payment", () => {
  const match = runMatch([idle()], 1, mini);
  assert.equal(match.auctions.length, 3);
  assert.ok(match.auctions.every(a => a.winner === undefined && a.paid === 0));
  assert.equal(match.players[0]!.rack.size, 0);
});

test("tied sealed bids are seeded-random rather than always first seat", () => {
  const winners = new Set<number | undefined>();
  for (let seed = 0; seed < 32; seed++) {
    winners.add(runMatch([bidder(2,"a"),bidder(2,"b")], seed, { ...mini, bag: ["A"] }).auctions[0]!.winner);
  }
  assert.deepEqual(winners, new Set([0,1]));
});

test("initial rack is playable but the final auction award cannot be played", () => {
  const collector: SimStrategy = { name: "collector", bid: () => 2,
    word: c => (c.myRack.get("A") ?? 0) >= 2 ? "AA" : null };
  const match = runMatch([collector], 4, { ...mini, startingTiles: 1 });
  assert.equal(match.auctions.length, 2);
  assert.deepEqual(match.players[0]!.words, ["AA"]);
  assert.equal(match.players[0]!.score, 2);
  assert.equal(match.players[0]!.rack.get("A"), 1);
  const initial = runMatch([collector], 4, { ...mini, startingTiles: 2 });
  assert.deepEqual(initial.players[0]!.words, ["AA"]);
  assert.equal(initial.players[0]!.rack.get("A"), 1);
});

test("word cashouts repeatedly consume counts and replenish balance and score", () => {
  const collector: SimStrategy = { name: "collector", bid: () => 0,
    word: c => (c.myRack.get("A") ?? 0) >= 2 ? "AA" : null };
  const match = runMatch([collector], 1, { ...mini, startingTiles: 4, bag: Array(5).fill("A") });
  assert.deepEqual(match.players[0]!.words, ["AA","AA"]);
  assert.equal(match.players[0]!.score, 4);
  assert.equal(match.players[0]!.balance, 104);
});

test("rejects unaffordable/noninteger bids and invalid words without granting points", () => {
  const match = runMatch([{ name:"bad", bid: () => 1000, word: () => "ZZ" }], 2, mini);
  assert.equal(match.players[0]!.score, 0);
  assert.equal(match.players[0]!.tilesWon, 0);
  assert.equal(match.errors.length, 6);
});

test("context exposes only public opponents and protects internal racks from mutation", () => {
  const match = runMatch([{ name:"mutator", word: () => null, bid: c => {
    assert.ok(c.players.every(p => !("rack" in p) && !("myRack" in p)));
    assert.ok(c.history.every(a => !("topBid" in a) && !("bids" in a)));
    c.myRack.set("Z", 1000);
    return 0;
  } }], 3, mini);
  assert.equal(match.players[0]!.rack.size, 0);
});

test("public word history contains only already committed words and is isolated from policy mutations", () => {
  const snapshots: number[] = [];
  const make = (name: string): SimStrategy => ({ name,
    word: c => {
      if (c.seat === 0 && c.round === 1 && (c.myRack.get('A') ?? 0) === 2) assert.equal(c.publicWords?.length, 0);
      return (c.myRack.get('A') ?? 0) >= 2 ? 'AA' : null;
    },
    bid: c => {
      snapshots.push(c.publicWords?.length ?? -1);
      assert.deepEqual(c.publicWords?.map(w => [w.seat, w.word, w.reward, w.round]), [[0, 'AA', 2, 1], [1, 'AA', 2, 1]]);
      if (c.publicWords?.[0]) (c.publicWords[0] as { reward:number }).reward = 10000;
      return 0;
    },
  });
  const match = runMatch([make('a'), make('b')], 9, { startingTiles:2, bag:['A','A','A','A','A','A'], dictionary:['AA'] });
  assert.deepEqual(match.errors, []);
  assert.deepEqual(match.players.map(p => p.score), [2, 2]);
  assert.deepEqual(snapshots, [2, 2, 2, 2]);
});

test("integer length rewards match authoritative tiers", () => {
  assert.equal(wordReward("CAT"),5);
  assert.equal(wordReward("QUIZ"),33);
  assert.equal(wordReward("ABCDE"),20);
  assert.equal(wordReward("ABCDEF"),35);
  assert.equal(wordReward("ABCDEFG"),48);
});

test("starter and score-greedy baselines differ on high-value short words", () => {
  const ctx = context("CATQI", ["CAT","QI","AT"]);
  assert.equal(createStarterBaseline().word(ctx), "CAT");
  assert.equal(createScoreGreedyBaseline().word(ctx), "QI");
  assert.equal(createCompletionBaseline().bid(context("Q",["QI"])), 9);
  assert.equal(createCompletionBaseline().bid({ ...context("Q",["QI"]), roundsRemaining:1 }), 0);
});

test("deterministic seeds reproduce racks, winners and words", () => {
  const make = () => [createStarterBaseline(),createCompletionBaseline()];
  const a = runMatch(make(), 109, { ...mini, trace:true });
  const b = runMatch(make(), 109, { ...mini, trace:true });
  assert.deepEqual(a.auctions,b.auctions);
  assert.deepEqual(a.trace,b.trace);
  assert.deepEqual(a.players.map(p => [p.balance,p.score,p.words,[...p.rack]]),b.players.map(p => [p.balance,p.score,p.words,[...p.rack]]));
});

test("benchmark rotates all strategy seats and fresh instances for every match", () => {
  let made = 0;
  const factories = [() => { made++; return idle("a"); }, () => { made++; return idle("b"); }, () => { made++; return idle("c"); }];
  const result = benchmark(factories,[1,2,3,4],mini);
  assert.equal(result.matches,12);
  assert.equal(made,39); // Three labels, plus a fresh instance per match/seat.
  for (const row of result.rows) {
    assert.deepEqual(row.seatCounts,[4,4,4]);
    assert.equal(row.matches,12);
    assert.ok(Math.abs(row.winRate - 1/3) < 1e-12);
    assert.ok(row.meanDecisionMs >= 0);
  }
  assert.deepEqual(result.errors,[]);
});
