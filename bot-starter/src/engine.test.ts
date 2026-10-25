import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { LETTER_VALUE, WordEngine, wordReward } from "./engine.js";

function rack(letters: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const c of letters) result.set(c, (result.get(c) ?? 0) + 1);
  return result;
}

function brutePacking(dictionary: string[], letters: string): number {
  const memo = new Map<string, number>();
  const visit = (counts: Map<string, number>): number => {
    const key = [...counts].filter(([, n]) => n > 0).sort().map(([c, n]) => c + n).join("");
    const saved = memo.get(key);
    if (saved !== undefined) return saved;
    let best = 0;
    for (const word of dictionary) {
      const next = new Map(counts);
      let valid = true;
      for (const c of word) {
        if (!(next.get(c)! > 0)) { valid = false; break; }
        next.set(c, next.get(c)! - 1);
      }
      if (valid) best = Math.max(best, wordReward(word) + visit(next));
    }
    memo.set(key, best);
    return best;
  };
  return visit(rack(letters));
}

function verifyPacking(engine: WordEngine, letters: string, budget = 100) {
  const result = engine.bestPacking(rack(letters), { timeBudgetMs: budget, maxNodes: 100_000 });
  const remaining = rack(letters);
  let actualScore = 0;
  for (const word of result.words) {
    assert.ok(engine.playable(remaining).some(candidate => candidate.word === word));
    actualScore += wordReward(word);
    for (const c of word) {
      assert.ok((remaining.get(c) ?? 0) > 0, `spent unavailable ${c} in ${word}`);
      const left = remaining.get(c)! - 1;
      if (left) remaining.set(c, left); else remaining.delete(c);
    }
  }
  assert.equal(result.score, actualScore);
  assert.deepEqual(result.remaining, remaining);
  return result;
}

test("word rewards exactly follow the module's integer multiplier rules", () => {
  assert.equal(wordReward("QI"), 11);
  assert.equal(wordReward("QUIZ"), 33); // 22 face points, 1.5x
  assert.equal(wordReward("JAZZ"), 43); // 29 * 1.5 floors the half point
  assert.equal(wordReward("JAZZY"), 66);
  assert.equal(wordReward("JAZZED"), 80); // 32 * 2.5
  assert.equal(wordReward("QUIZZES"), 102);
  assert.equal(wordReward("qi"), 11);
  assert.equal(LETTER_VALUE.Q, 10);
});

test("playable words enforce duplicate counts, deduplicate anagrams and normalize input", () => {
  const engine = new WordEngine(["cat", "ACT", "TACT", "TAC", "CAT", "I", "NO-WAY", "  AT  "]);
  assert.equal(engine.anagramCount, 3);
  assert.deepEqual(engine.playable(rack("CAT")).map(w => w.word), ["ACT", "AT"]);
  assert.deepEqual(engine.playable(rack("TACT")).map(w => w.word), ["TACT", "ACT", "AT"]);
  assert.deepEqual(engine.playable(rack("CX")), []);
  assert.deepEqual(engine.playable(rack("ZZ")), []);
});

test("near words report repeated missing letters rather than just missing kinds", () => {
  const engine = new WordEngine(["JAZZ", "QUIZ", "QI", "QUIP", "AT"]);
  const found = engine.nearWords(rack("JA"), 2);
  const jazz = found.find(w => w.word === "JAZZ")!;
  assert.equal(jazz.missingCount, 2);
  assert.deepEqual(jazz.missing, new Map([["Z", 2]]));
  assert.equal(engine.nearWords(rack("JA"), 1).some(w => w.word === "JAZZ"), false);
  const qi = engine.nearWords(rack("QI"), 0);
  assert.equal(qi.length, 1);
  assert.equal(qi[0].missingCount, 0);
  assert.equal(qi[0].missing.size, 0);
});

test("packing permits repeated words and preserves unusable letters", () => {
  const engine = new WordEngine(["QI", "AT", "JAZZ", "QUIZ"]);
  const result = verifyPacking(engine, "QIQIATJ");
  assert.equal(result.score, 24);
  assert.equal(result.words.filter(w => w === "QI").length, 2);
  assert.deepEqual(result.remaining, new Map([["J", 1]]));
  assert.equal(result.exact, true);
});

test("multiword search beats a greedy highest-scoring first word", () => {
  const words = ["ABCDJKQ", "AHIJKLM", "BCDNOPQ"];
  const letters = "AHIJKLMBCDNOPQ";
  const engine = new WordEngine(words);
  assert.equal(engine.playable(rack(letters))[0].word, "ABCDJKQ");
  const result = verifyPacking(engine, letters);
  assert.equal(result.score, wordReward("AHIJKLM") + wordReward("BCDNOPQ"));
  assert.ok(result.score > wordReward("ABCDJKQ"));
  assert.equal(result.score, brutePacking(words, letters));
  assert.equal(result.exact, true);
});

test("packing agrees with an independent exhaustive solver across small racks", () => {
  const words = ["AB", "AC", "BC", "AA", "ABA", "CAB", "ABB", "ABCA", "BBAC", "ABACC"];
  const engine = new WordEngine(words);
  let seed = 9137;
  for (let example = 0; example < 80; example++) {
    let letters = "";
    for (let n = 0; n < 5 + example % 5; n++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      letters += "ABC"[seed % 3];
    }
    const result = verifyPacking(engine, letters, 500);
    assert.equal(result.score, brutePacking(words, letters), letters);
    assert.equal(result.exact, true, letters);
  }
});

test("an expired search budget returns feasible words without claiming optimality", () => {
  const engine = new WordEngine(["CAT", "DOG", "AT", "TO", "DO", "GO"]);
  const result = engine.bestPacking(rack("CATDOG"), { timeBudgetMs: 0, maxNodes: 0 });
  assert.equal(result.exact, false);
  assert.equal(result.nodes, 0);
  assert.ok(result.words.length > 0);
  assert.equal(result.score, result.words.reduce((sum, word) => sum + wordReward(word), 0));
  verifyPacking(engine, "CATDOG");
});

test("empty racks and unspellable racks are solved exactly", () => {
  const engine = new WordEngine(["AT", "TO"]);
  assert.deepEqual(engine.bestPacking(new Map()).words, []);
  assert.equal(engine.bestPacking(rack("ZZZ")).score, 0);
  assert.equal(engine.bestPacking(rack("ZZZ")).exact, true);
});

test("the authoritative full dictionary stays well inside a one-second auction", () => {
  const words = readFileSync(new URL("../../spacetimedb/wordlist.txt", import.meta.url), "utf8").split("\n");
  const constructionStart = performance.now();
  const engine = new WordEngine(words);
  const constructionMs = performance.now() - constructionStart;
  assert.ok(engine.wordCount > 170_000);
  assert.ok(engine.anagramCount < engine.wordCount);
  const samples = ["QUIZAT", "JAZZEDATINORST", "BCDFGHJKLMNPQRSTVWXZ", "AEINORSTAEINORST"];
  let longestQuery = 0;
  for (const letters of samples) {
    const start = performance.now();
    const playable = engine.playable(rack(letters));
    const near = engine.nearWords(rack(letters), 3);
    const packing = verifyPacking(engine, letters, 20);
    const elapsed = performance.now() - start;
    longestQuery = Math.max(longestQuery, elapsed);
    assert.ok(elapsed < 400, `${letters}: query took ${elapsed.toFixed(1)}ms`);
    for (const candidate of playable) assert.equal(candidate.score, wordReward(candidate.word));
    for (const candidate of near) assert.ok(candidate.missingCount <= 3);
    assert.ok(packing.score >= (playable[0]?.score ?? 0));
  }
  const wholeBag = new Map(Object.entries({
    A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1,
    K: 1, L: 4, M: 2, N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6,
    U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1,
  }));
  const largeStarted = performance.now();
  const bounded = engine.bestPacking(wholeBag, { timeBudgetMs: 5, maxNodes: 100 });
  const largeMs = performance.now() - largeStarted;
  assert.ok(largeMs < 500, `a 98-tile rack took ${largeMs.toFixed(1)}ms`);
  assert.ok(bounded.nodes <= 100);
  const after = new Map(wholeBag);
  for (const word of bounded.words) for (const letter of word) {
    assert.ok((after.get(letter) ?? 0) > 0);
    after.set(letter, after.get(letter)! - 1);
  }
  for (const [letter, count] of after) assert.equal(bounded.remaining.get(letter) ?? 0, count);
  assert.equal(bounded.score, bounded.words.reduce((sum, word) => sum + wordReward(word), 0));
  console.info(`WordEngine: ${engine.wordCount} words / ${engine.anagramCount} anagrams; startup ${constructionMs.toFixed(1)}ms; longest combined query ${longestQuery.toFixed(1)}ms`);
});
