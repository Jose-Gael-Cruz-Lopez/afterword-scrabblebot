import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LastTileDenial } from './last-tile-denial.js';
import type { BidContext } from './strategy.js';
const context = (left: number, balance = 71): BidContext => ({ myRack: new Map([['Q', 1]]), letter: 'X', myBalance: balance, roundsRemaining: left });

test('last useful auction bids entire balance even when inner own-value bid is zero', () => {
  const calls: BidContext[] = [];
  const policy = new LastTileDenial({ word: () => null, bid: c => { calls.push(c); return 0; } });
  const ctx = context(2);
  assert.equal(policy.bid(ctx), 71);
  assert.deepEqual(calls, [ctx], 'inner bid must run to prime a monotone terminal floor');
});
test('all other auctions, including unusable final award, retain the inner bid exactly', () => {
  const policy = new LastTileDenial({ word: () => null, bid: c => c.roundsRemaining === 1 ? 0 : 13 });
  for (const left of [68, 12, 3]) assert.equal(policy.bid(context(left)), 13);
  assert.equal(policy.bid(context(1)), 0);
});
test('word decisions pass through unchanged with the exact input object', () => {
  const ctx = context(2);
  const policy = new LastTileDenial({ word: c => { assert.equal(c, ctx); return 'AX'; }, bid: () => 0 });
  assert.equal(policy.word(ctx), 'AX');
  assert.deepEqual([...ctx.myRack], [['Q', 1]]);
});
test('all-in amounts remain finite, nonnegative integers within available currency', () => {
  const policy = new LastTileDenial({ word: () => null, bid: () => 0 });
  assert.equal(policy.bid(context(2, 0)), 0);
  assert.equal(policy.bid(context(2, -10)), 0);
  assert.equal(policy.bid(context(2, 17.9)), 17);
  assert.equal(policy.bid(context(2, NaN)), 0);
  assert.equal(policy.bid(context(2, Infinity)), 0);
});
