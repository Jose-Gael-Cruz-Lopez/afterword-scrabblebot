import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimePlanner } from './runtime-planner.js';
import { canonicalAuctionType } from './runtime-state.js';
import type { BidContext } from './strategy.js';

test('the real planner worker accepts funded policy and preserves final auction semantics', { timeout: 20_000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'afterword-planner-'));
  const dictionary = join(directory, 'words.txt');
  writeFileSync(dictionary, 'AT\nATE\nEAT\nTEA\nEAR\nARE\nART\nRAT\nRATE\nTEAR\nSTAR\nSTARE\n');
  const previous = process.env.BOT_POLICY;
  process.env.BOT_POLICY = 'funded';
  const planner = new RuntimePlanner(dictionary);
  // Workers copy the environment at construction, so restore the test process.
  if (previous === undefined) delete process.env.BOT_POLICY; else process.env.BOT_POLICY = previous;
  const context: BidContext = {
    matchId: 'runtime-test', myRack: new Map([['Z', 1]]), initialRack: new Map([['Z', 1]]),
    myBalance: 23, letter: 'A', seat: 0, round: 67, roundsRemaining: 2,
    auctionType: canonicalAuctionType('Vickrey'), players: [{ seat: 0, balance: 23, score: 0 }, { seat: 1, balance: 15, score: 0 }],
    history: [], publicWords: [],
  };
  try {
    assert.equal(await planner.ready, 12);
    const usable = await planner.plan(context);
    assert.equal(usable.word, null);
    assert.equal(usable.bid, 23);
    const final = await planner.plan({ ...context, round: 68, roundsRemaining: 1 });
    assert.equal(final.word, null);
    assert.equal(final.bid, 0);
    const modeled = await planner.plan({ ...context, round: 55, roundsRemaining: 14 });
    assert.equal(modeled.word, null);
    assert.ok(Number.isInteger(modeled.bid) && modeled.bid! >= 0 && modeled.bid! <= 23);
  } finally {
    await planner.stop();
    rmSync(directory, { recursive: true });
  }
});
