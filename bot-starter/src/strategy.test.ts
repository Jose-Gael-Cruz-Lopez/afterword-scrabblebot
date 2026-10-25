import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createStrategy, type BidContext } from "./strategy.js";
import { wordReward } from "./engine.js";

function rack(letters: string): Map<string, number> {
  const r = new Map<string, number>();
  for (const c of letters) r.set(c, (r.get(c) ?? 0) + 1);
  return r;
}

function consume(letters: Map<string, number>, word: string): void {
  for (const c of word) {
    assert.ok((letters.get(c) ?? 0) > 0, `unavailable ${c} in ${word}`);
    const next = letters.get(c)! - 1;
    if (next) letters.set(c, next); else letters.delete(c);
  }
}

test("a promising incomplete rack is held instead of selling its only tiny word", () => {
  const planner = createStrategy(["AT", "TACT"]);
  assert.equal(planner.chooseWord({ myRack: rack("TAC"), myBalance: 100, roundsRemaining: 60 }), null);
});

test("low working capital triggers a legal cashout instead of waiting indefinitely", () => {
  const planner = createStrategy(["AT", "TACT"]);
  const letters = rack("TAC");
  const word = planner.chooseWord({ myRack: letters, myBalance: 2, roundsRemaining: 60 });
  assert.equal(word, "AT");
  consume(letters, word!);
  assert.deepEqual(letters, rack("C"));
});

test("terminal cashout uses actual rewards rather than longest-word preference", () => {
  const planner = createStrategy(["JAZZ", "TRAIN"]);
  const word = planner.chooseWord({ myRack: rack("JAZZTRAIN"), myBalance: 100, roundsRemaining: 1 });
  assert.equal(word, "JAZZ");
  assert.ok(wordReward(word!) > wordReward("TRAIN"));
});

test("a maximum-multiplier cashout preserves the better multiword packing", () => {
  const planner = createStrategy(["ABCDJKQ", "AHIJKLM", "BCDNOPQ"]);
  const letters = rack("AHIJKLMBCDNOPQ");
  const first = planner.chooseWord({ myRack: letters, myBalance: 100, roundsRemaining: 40 });
  assert.ok(first === "AHIJKLM" || first === "BCDNOPQ");
  consume(letters, first!);
  const second = planner.chooseWord({ myRack: letters, myBalance: 100, roundsRemaining: 40 });
  assert.ok(second);
  consume(letters, second!);
  assert.equal(wordReward(first!) + wordReward(second!), 138);
  assert.equal(letters.size, 0);
});

test("final open auction liquidates multiple words, with duplicate counts intact", () => {
  const planner = createStrategy(["QI", "AT", "QUIZ"]);
  const letters = rack("QIQIATJ");
  const played: string[] = [];
  for (let i = 0; i < 6; i++) {
    const word = planner.chooseWord({ myRack: letters, myBalance: 0, roundsRemaining: 1 });
    if (!word) break;
    consume(letters, word);
    played.push(word);
  }
  assert.equal(played.reduce((score, word) => score + wordReward(word), 0), 24);
  assert.equal(played.filter(word => word === "QI").length, 2);
  assert.deepEqual(letters, rack("J"));
});

test("duplicate letters are required and an unspellable word is never fabricated", () => {
  const planner = createStrategy(["QUIZZES", "JAZZ", "QI"]);
  const letters = rack("QUIZES");
  const word = planner.chooseWord({ myRack: letters, roundsRemaining: 1 });
  assert.equal(word, "QI");
  assert.notEqual(word, "QUIZZES");
  assert.equal(planner.chooseWord({ myRack: rack("JAZ"), roundsRemaining: 1 }), null);
});

test("the last auction tile receives no bid because it cannot be cashed out", () => {
  const planner = createStrategy(["QUIZ", "QI"]);
  const ctx = { myRack: rack("QUI"), myBalance: 100, letter: "Z" };
  assert.equal(planner.decideBid({ ...ctx, roundsRemaining: 1 }), 0);
  assert.equal(planner.decideBid({ ...ctx, roundsRemaining: 0 }), 0);
  assert.ok(planner.decideBid({ ...ctx, roundsRemaining: 2 }) > 0);
});

test("a high-value completion attracts a stronger bid than an unrelated tile", () => {
  const planner = createStrategy(["AT", "ATONERS"]);
  const ctx = { myRack: rack("ATONER"), myBalance: 100, roundsRemaining: 40 };
  const completes = planner.decideBid({ ...ctx, letter: "S" });
  const unrelated = planner.decideBid({ ...ctx, letter: "X" });
  assert.ok(completes > unrelated, `completion ${completes}, unrelated ${unrelated}`);
  assert.ok(completes <= ctx.myBalance);
});

test("first-price bidding does not spend more than the equivalent Vickrey bid", () => {
  const planner = createStrategy(["AT", "ATONERS"]);
  const ctx = { myRack: rack("ATONER"), myBalance: 100, roundsRemaining: 30, letter: "S" };
  const vickrey = planner.decideBid({ ...ctx, auctionType: "Vickrey" });
  const first = planner.decideBid({ ...ctx, auctionType: "FirstPrice" });
  assert.ok(first > 0);
  assert.ok(first <= vickrey);
});

test("bids are finite integers within the available budget across cash and horizon cases", () => {
  const planner = createStrategy(["AT", "TACT", "QI", "QUIZ", "QUIZZES"]);
  for (const balance of [-10, 0, 0.5, 1, 2, 5, 99.9, 1000, Number.NaN]) {
    for (const roundsRemaining of [0, 1, 2, 5, 60]) {
      for (const auctionType of ["FirstPrice", "Vickrey"]) {
        const bid = planner.decideBid({ myRack: rack("QUI"), myBalance: balance, letter: "Z", roundsRemaining, auctionType });
        assert.ok(Number.isFinite(bid));
        assert.ok(Number.isInteger(bid));
        assert.ok(bid >= 0);
        assert.ok(bid <= (Number.isFinite(balance) ? Math.max(0, Math.floor(balance)) : 0));
      }
    }
  }
});

test("invalid letters and an empty bankroll cannot submit a positive bid", () => {
  const planner = createStrategy(["AT", "TACT"]);
  for (const letter of ["", "?", "ZZ", "a"]) {
    assert.equal(planner.decideBid({ myRack: rack("TAC"), myBalance: 100, letter }), 0);
  }
  assert.equal(planner.decideBid({ myRack: rack("TAC"), myBalance: 0, letter: "T" }), 0);
});

test("planning preserves caller-owned rack, initial rack and public history", () => {
  const planner = createStrategy(["AT", "TACT", "CAT", "CATS"]);
  const letters = rack("TAC"), initialRack = rack("TAC");
  const history = [{ round: 1, letter: "Z", winner: 2, paid: 4 }];
  const snapshot = structuredClone({ letters, initialRack, history });
  const ctx: BidContext = { myRack: letters, initialRack, history, letter: "T", myBalance: 100, roundsRemaining: 10 };
  planner.decideBid(ctx);
  planner.chooseWord(ctx);
  assert.deepEqual({ letters, initialRack, history }, snapshot);
});

// Startup indexing is deliberately outside per-turn measurements: the live
// client prepares the authoritative lexicon before entering a match.
const dictionary = readFileSync(new URL("../../spacetimedb/wordlist.txt", import.meta.url), "utf8")
  .split(/\r?\n/).map(w => w.trim().toUpperCase()).filter(w => /^[A-Z]{2,}$/.test(w));
const fullPlanner = createStrategy(dictionary);

test("prewarmed full-dictionary planning remains responsive on varied late-game racks", () => {
  let longestMs = 0;
  let longestCpuMs = 0;
  for (const letters of ["BCDFGHJKLMNPQRSTVWXZ", "JAZZEDATINORST", "AEINORSTAEINORST", "QIUAEINOR"]) {
    const ctx = { myRack: rack(letters), myBalance: 100, roundsRemaining: 8, letter: "S" };
    const start = performance.now();
    const cpuStart = process.cpuUsage();
    const bid = fullPlanner.decideBid(ctx);
    const word = fullPlanner.chooseWord(ctx);
    const cpu = process.cpuUsage(cpuStart);
    const cpuMs = (cpu.user + cpu.system) / 1000;
    const ms = performance.now() - start;
    longestMs = Math.max(longestMs, ms);
    longestCpuMs = Math.max(longestCpuMs, cpuMs);
    // CPU work is stable under parallel test/benchmark contention. Also retain
    // a wall-clock guard against crossing an entire standard auction window.
    assert.ok(cpuMs < 350, `${letters} used ${cpuMs.toFixed(1)}ms CPU after startup`);
    assert.ok(ms < 1000, `${letters} needed ${ms.toFixed(1)}ms wall time after startup`);
    assert.ok(bid >= 0 && bid <= ctx.myBalance);
    if (word) { assert.ok(dictionary.includes(word)); consume(new Map(ctx.myRack), word); }
  }
  console.info(`ChampionStrategy: longest paired bid/word decision ${longestMs.toFixed(1)}ms wall / ${longestCpuMs.toFixed(1)}ms CPU after startup`);
});

// Public price pressure in live matches can be higher than synthetic opponents.
test("market calibration raises only a cold affordable rack in a high-price market", () => {
  const dictionary=['AT','ATE','LATE','SLATE','SLATER','RELATES'];
  const normal=createStrategy(dictionary,{marketRebuild:false});
  const live=createStrategy(dictionary,{marketRebuild:true});
  const context={letter:'E',myBalance:100,myRack:rack('ALT'),roundsRemaining:50,history:[{letter:'A',paid:14},{letter:'R',paid:16},{letter:'N',paid:15},{letter:'T',paid:14}]};
  assert.ok(live.decideBid(context)>normal.decideBid(context));
  assert.equal(live.decideBid({...context,myBalance:0}),0);
  assert.equal(live.decideBid({...context,roundsRemaining:1}),0);
  assert.equal(live.decideBid({...context,history:[]}),normal.decideBid({...context,history:[]}));
  assert.ok(live.decideBid({...context,myRack:rack('EEEEA'),letter:'I'})<=normal.decideBid({...context,myRack:rack('EEEEA'),letter:'I'}));
});

test("the last usable tile gets all remaining money for a strict packing improvement", () => {
 const planner=createStrategy(['AT','ART','TARS']);
 const context={letter:'S',myBalance:97,myRack:rack('ART'),roundsRemaining:2};
 assert.equal(planner.chooseWord(context),null);
 assert.equal(planner.decideBid(context),97);
 assert.equal(planner.decideBid({...context,letter:'Z'}),0);
 assert.equal(planner.chooseWord({...context,roundsRemaining:1}),'ART');
 assert.equal(planner.chooseWord({...context,myBalance:0}),'ART');
});
