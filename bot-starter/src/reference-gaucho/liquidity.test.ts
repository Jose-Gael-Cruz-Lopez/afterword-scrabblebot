import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiquidityStrategy } from './liquidity.js';

const rack = new Map([['P', 1], ['A', 1], ['I', 2], ['R', 1], ['N', 1], ['G', 1]]);
const base = { myRack: rack, myBalance: 11, letter: 'O', round: 57, roundsRemaining: 12,
  seat: 0, auctionType: 'SecondPrice', history: Array.from({ length: 8 }, (_, i) => ({ round: 49 + i, letter: 'E', paid: 14, winner: 1 })) };
test('liquidity candidate funds rebuilding from a mature word after an observed unaffordable market stall', () => {
  const strategy = new LiquidityStrategy(['PAIRING', 'PRAYING']);
  assert.equal(strategy.word(base), 'PAIRING');
  assert.deepEqual([...rack], [['P', 1], ['A', 1], ['I', 2], ['R', 1], ['N', 1], ['G', 1]]);
});
test('liquidity exception stays off with affordable purchases, recent acquisitions or too little rebuilding time', () => {
  const strategy = new LiquidityStrategy(['PAIRING', 'PRAYING']);
  assert.equal(strategy.word({ ...base, myBalance: 20 }), null);
  assert.equal(strategy.word({ ...base, history: [...base.history, { round: 56, letter: 'E', paid: 10, winner: 0 }] }), null);
  assert.equal(strategy.word({ ...base, roundsRemaining: 7 }), null);
});
