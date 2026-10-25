import { test } from "node:test";
import assert from "node:assert/strict";
import { auctionsRemaining, canonicalAuctionType, cappedBid, rackKey, reconstructInitialRack } from "./runtime-state.js";
import { RuntimePlanner } from "./runtime-planner.js";
import { fileURLToPath } from "node:url";

test("server Vickrey snapshots reach the tested SecondPrice policy without changing other modes", () => {
  assert.equal(canonicalAuctionType("Vickrey"), "SecondPrice");
  assert.equal(canonicalAuctionType("SecondPrice"), "SecondPrice");
  assert.equal(canonicalAuctionType("FirstPrice"), "FirstPrice");
  assert.equal(canonicalAuctionType("unknown"), "unknown");
});

test("auction horizon includes the current tile, excludes dealt racks, and reaches one before match end", () => {
  assert.equal(auctionsRemaining(5, 6, 1), 68);
  assert.equal(auctionsRemaining(5, 6, 68), 1);
  assert.equal(auctionsRemaining(5, 6, 69), 0);
});
test("resume reconstructs original private rack after both awards and cash-outs", () => {
  const initial = reconstructInitialRack(new Map([["A", 1], ["T", 1], ["S", 1]]), ["CAT", "ATE"], ["T", "E", "S", "A"], 5);
  assert.equal(rackKey(initial!), "A2C1T2");
});
test("partial subscription transactions cannot poison the initial-rack snapshot", () => {
  assert.equal(reconstructInitialRack(new Map([["A", 1]]), [], ["E"], 5), undefined);
  assert.equal(reconstructInitialRack(new Map([["A", 1]]), [], [], 5), undefined);
});
test("bid sanitization never overspends or submits non-finite numbers", () => {
  assert.equal(cappedBid(110, 100), 100);
  assert.equal(cappedBid(-1, 100), 0);
  assert.equal(cappedBid(NaN, 100), 0);
  assert.equal(cappedBid(9.9, 100), 9);
});
test("real worker starts under tsx, searches the official dictionary and liquidates before final auction", async () => {
  const planner = new RuntimePlanner(fileURLToPath(new URL("../../spacetimedb/wordlist.txt", import.meta.url)));
  try {
    assert.ok(await planner.ready > 100_000);
    const plan = await planner.plan({ myRack: new Map([["A", 1], ["X", 1]]), myBalance: 100, letter: "E", roundsRemaining: 1 });
    assert.equal(plan.word, "AX");
    assert.equal(plan.bid, null);
    const empty = await planner.plan({ myRack: new Map(), myBalance: 100, letter: "E", roundsRemaining: 1 });
    assert.equal(empty.word, null);
    assert.equal(empty.bid, 0);
    const firstReady = planner.ready;
    const worker = Reflect.get(planner, "worker") as import("node:worker_threads").Worker;
    await worker.terminate();
    assert.notEqual(planner.ready, firstReady, "a dead worker must be replaced, not leave future jobs hanging");
    assert.ok(await planner.ready > 100_000);
    const recovered = await planner.plan({ myRack: new Map([["A", 1], ["X", 1]]), myBalance: 100, letter: "E", roundsRemaining: 1 });
    assert.equal(recovered.word, "AX");
  } finally { await planner.stop(); }
});
