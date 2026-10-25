import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GauchoReference, compileDictionary } from './adapter.js';
import { bestWord } from './core/dict.js';
import { rackFromMap } from './core/rules.js';

function rack(letters: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const c of letters) result.set(c, (result.get(c) ?? 0) + 1);
  return result;
}
function remove(r: ReadonlyMap<string, number>, word: string): Map<string, number> {
  const result = new Map(r);
  for (const c of word) {
    assert.ok((result.get(c) ?? 0) > 0, `illegal cashout ${word}`);
    const left = result.get(c)! - 1;
    if (left) result.set(c, left); else result.delete(c);
  }
  return result;
}
function brutePartition(words: string[], initial: ReadonlyMap<string, number>): number {
  const memo = new Map<string, number>();
  const visit = (r: ReadonlyMap<string, number>): number => {
    const key = [...r].sort().map(([c, n]) => c + n).join('');
    const saved = memo.get(key); if (saved !== undefined) return saved;
    let best = 0;
    for (const word of words) {
      const next = new Map(r); let legal = true, face = 0;
      for (const c of word) {
        const have = next.get(c) ?? 0;
        if (have <= 0) { legal = false; break; }
        if (have === 1) next.delete(c); else next.set(c, have - 1);
        face += ({ A:1,B:3,C:3,R:1,S:1,T:1,X:8 } as Record<string, number>)[c] ?? 1;
      }
      if (!legal) continue;
      const multiplier = word.length <= 3 ? 1 : word.length === 4 ? 1.5 : word.length === 5 ? 2 : word.length === 6 ? 2.5 : 3;
      best = Math.max(best, Math.floor(face * multiplier) + visit(next));
    }
    memo.set(key, best); return best;
  };
  return visit(initial);
}

test('licensed reference dictionary layout uses correct rewards and duplicate counts', () => {
  const words = ['AX', 'CAT', 'CATS', 'TACT'];
  const d = compileDictionary(words);
  assert.equal(compileDictionary(words), d);
  const k = bestWord(d, rackFromMap(new Map([['A', 1], ['X', 1]])));
  assert.equal(d.words[k], 'AX'); assert.equal(d.rew[k], 9);
  const duplicate = bestWord(d, rackFromMap(new Map([['T', 1], ['A', 1], ['C', 1]])));
  assert.equal(d.words[duplicate], 'CAT');
});
test('reference adapts final auction horizon and never bids for an unusable tile', () => {
  const ref = new GauchoReference(['AX', 'CAT']);
  const ctx = { myRack: new Map([['A', 1]]), myBalance: 80, letter: 'X', roundsRemaining: 1, round: 68, auctionType: 'SecondPrice' };
  assert.equal(ref.bid(ctx), 0);
  assert.equal(ref.bid({ ...ctx, roundsRemaining: 2 }), 80);
  assert.equal(ref.word({ ...ctx, myRack: new Map([['A', 1], ['X', 1]]) }), 'AX');
});
test('reference retains caller rack and produces legal bounded bids', () => {
  const rack = new Map([['A', 1], ['C', 1], ['T', 1]]);
  const ref = new GauchoReference(['AX', 'CAT', 'CATS']);
  const before = [...rack];
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const bid = ref.bid({ myRack: rack, myBalance: 13, letter, roundsRemaining: 12, round: 55, auctionType: 'SecondPrice' });
    assert.ok(Number.isInteger(bid) && bid >= 0 && bid <= 13);
  }
  assert.deepEqual([...rack], before);
});

test('terminal-safe opt-in sells AX from AXCAR without losing either T outcome', () => {
  const words = ['AX', 'CAR', 'CART', 'ART', 'AT'];
  const ref = new GauchoReference(words, { terminalSafe: true });
  const ctx = { myRack: rack('AXCAR'), myBalance: 12, letter: 'T', roundsRemaining: 2, auctionType: 'SecondPrice' };
  assert.equal(ref.word(ctx), 'AX');
  const rest = remove(ctx.myRack, 'AX'), augmented = rack('AXCART'), restPlusTile = rack('CART');
  assert.equal(9 + brutePartition(words, rest), brutePartition(words, ctx.myRack));
  assert.equal(9 + brutePartition(words, restPlusTile), brutePartition(words, augmented));
});

test('terminal-safe opt-in holds ART for S; default preserves the untouched behavior', () => {
  const words = ['ART', 'ARTS', 'AT'];
  const safe = new GauchoReference(words, { terminalSafe: true }), untouched = new GauchoReference(words);
  const ctx = { myRack: rack('ART'), myBalance: 20, letter: 'S', roundsRemaining: 2, auctionType: 'SecondPrice' };
  assert.equal(safe.word(ctx), null);
  assert.equal(untouched.word(ctx), 'ART');
  assert.equal(safe.bid(ctx), 20);
});

test('zero-cash terminal fallback sells a legal word instead of waiting without purchasing power', () => {
  const ref = new GauchoReference(['ART', 'ARTS', 'AT'], { terminalSafe: true });
  const ctx = { myRack: rack('ART'), myBalance: 0, letter: 'S', roundsRemaining: 2 };
  assert.equal(ref.word(ctx), 'ART');
  assert.equal(ref.word({ ...ctx, roundsRemaining: 1, myBalance: 20 }), 'ART');
});

test('every certified small-rack cashout preserves both exact partition outcomes', () => {
  const words = ['AA','AB','AC','BB','BC','CC','ABC','AAB','ABB','AAC','BCC','ABCA','ABBC','AABB','ABCCC'];
  const ref = new GauchoReference(words, { terminalSafe: true });
  let checked = 0, certified = 0;
  for (let a = 0; a <= 3; a++) for (let b = 0; b <= 3; b++) for (let c = 0; c <= 3; c++) {
    if (a + b + c > 8) continue;
    const letters = 'A'.repeat(a) + 'B'.repeat(b) + 'C'.repeat(c);
    for (const tile of 'ABC') {
      const r = rack(letters), before = [...r];
      const word = ref.word({ myRack: r, myBalance: 17, letter: tile, roundsRemaining: 2 });
      checked++; assert.deepEqual([...r], before);
      if (!word) continue;
      certified++;
      const rest = remove(r, word), plus = rack(letters + tile), restPlus = new Map(rest);
      restPlus.set(tile, (restPlus.get(tile) ?? 0) + 1);
      const credit = brutePartition([word], rack(word));
      assert.equal(credit + brutePartition(words, rest), brutePartition(words, r), `${letters} sell ${word}, lose ${tile}`);
      assert.equal(credit + brutePartition(words, restPlus), brutePartition(words, plus), `${letters} sell ${word}, win ${tile}`);
    }
  }
  assert.ok(checked > 150);
  assert.ok(certified > 20);
});
