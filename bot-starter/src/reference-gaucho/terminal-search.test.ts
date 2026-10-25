import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileDictionary } from './adapter.js';
import { findSafeTerminalCashout } from './terminal-search.js';
import { rackFromMap, VALUE } from './core/rules.js';

const words = ['AA', 'AB', 'AC', 'BB', 'BC', 'CC', 'ABC', 'AAB', 'ABB', 'AAC', 'BCC', 'ABCA', 'ABBC', 'AABB', 'ABCCC'];
const dictionary = compileDictionary(words);
function subtract(rack: string, word: string): string | null {
  let rest = rack;
  for (const c of word) {
    const i = rest.indexOf(c);
    if (i < 0) return null;
    rest = rest.slice(0, i) + rest.slice(i + 1);
  }
  return rest;
}
function reward(word: string): number {
  const face = [...word].reduce((sum, c) => sum + VALUE[c.charCodeAt(0) - 65]!, 0);
  return Math.floor(face * (word.length <= 3 ? 1 : word.length === 4 ? 1.5 : word.length === 5 ? 2 : word.length === 6 ? 2.5 : 3));
}
const memo = new Map<string, number>();
function brute(rack: string): number {
  rack = [...rack].sort().join('');
  const cached = memo.get(rack);
  if (cached !== undefined) return cached;
  let best = 0;
  for (const word of words) {
    const rest = subtract(rack, word);
    if (rest !== null) best = Math.max(best, reward(word) + brute(rest));
  }
  memo.set(rack, best);
  return best;
}
function counts(rack: string): Int32Array {
  const map = new Map<string, number>();
  for (const c of rack) map.set(c, (map.get(c) ?? 0) + 1);
  return rackFromMap(map);
}

test('shared cashout recursion agrees with an independent exhaustive proof in both auction outcomes', () => {
  let checked = 0;
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
    const rack = 'A'.repeat(a) + 'B'.repeat(b) + 'C'.repeat(c);
    for (const letter of 'ABC') {
      const expected = dictionary.words.find(word => {
        const rest = subtract(rack, word);
        return rest !== null && reward(word) + brute(rest) === brute(rack)
          && reward(word) + brute(rest + letter) === brute(rack + letter);
      }) ?? null;
      const initial = counts(rack), copy = new Int32Array(initial);
      assert.equal(findSafeTerminalCashout(dictionary, initial, letter.charCodeAt(0) - 65), expected);
      assert.deepEqual(initial, copy, 'must not mutate the caller rack');
      checked++;
    }
  }
  assert.equal(checked, 192);
});

test('an expired cashout proof never authorizes a sale', () => {
  assert.equal(findSafeTerminalCashout(dictionary, counts('AABBCC'), 0, { timeBudgetMs: 0 }), null);
  assert.equal(findSafeTerminalCashout(dictionary, counts('AABBCC'), 0, { maxNodes: 0 }), null);
  assert.equal(findSafeTerminalCashout(dictionary, counts('AABBCC'), -1), null);
});
