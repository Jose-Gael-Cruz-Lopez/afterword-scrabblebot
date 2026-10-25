/** API correctness checks only; not gameplay validation. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { rivalThresholdPrior, estimateRivalThreshold, sampleRivalThreshold, THRESHOLD_PRIOR_PROVENANCE } from '../../bot-starter/src/reference-gaucho/threshold-prior.ts';
const fixture = readFileSync(new URL('./latest-field-replay-input.json', import.meta.url));
assert.equal(THRESHOLD_PRIOR_PROVENANCE.fixtureSHA256, createHash('sha256').update(fixture).digest('hex'));
let calls = 0;
const current = { letter: 'Z', round: 14, roundsRemaining: 55, seat: 0, players: [{ seat: 0, balance: 100 }, { seat: 1, balance: 7 }, { seat: 2, balance: 4 }, { seat: 3, balance: 0 }, { seat: 4, balance: 2 }, { seat: 5, balance: 1 }] };
assert.equal(rivalThresholdPrior(current).cap, 7);
assert.equal(estimateRivalThreshold(current, 1), 7, 'Exclude own100 balance from rival cap');
assert.ok(estimateRivalThreshold(current, .9, { clampToPublicBalances: false }) > 7, 'Future caller can disable cap');
const sampled = sampleRivalThreshold(current, () => { calls++; return .8; });
assert.equal(calls, 1); assert.ok(sampled <= 7 && Number.isInteger(sampled));
assert.equal(rivalThresholdPrior({ ...current, round: 68, roundsRemaining: 1 }).quantiles.every(q => q === 0), true);
assert.equal(rivalThresholdPrior({ ...current, round: 67, roundsRemaining: 2 }).bucket, 5);
assert.equal(rivalThresholdPrior({ ...current, round: 28, roundsRemaining: 41 }).phase, 1);
assert.equal(rivalThresholdPrior({ ...current, letter: '?' }).quantiles.every(q => q === 0), true);
assert.equal(estimateRivalThreshold({ ...current, players: current.players.map((p,i) => ({ ...p, balance: i ? 0 : 100 })) }, .9), 0);
assert.equal(rivalThresholdPrior({ ...current, players: undefined, playerCount: 7 }).playerCount, 7);
for (const count of [6, 7]) for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') for (let round = 1; round <= 98-5*count; round++) {
  const info = rivalThresholdPrior({ letter, round, roundsRemaining: 99-5*count-round, playerCount: count }, { clampToPublicBalances: false });
  assert.equal(info.quantiles.length, 33);
  assert.ok(info.quantiles.every((q,i,qs) => Number.isFinite(q) && q >= 0 && (i === 0 || q >= qs[i-1]!)));
}
const result = { passed: true, checks: ['fixture provenance hash', 'exclude focal cash from cap', 'future cap opt-out', 'one reproducible RNG draw', 'final unusable returns0', 'last usable tail bucket', 'normalized phase', 'invalid letter', 'zero opponent balances', 'six/seven context', 'all letter/round quantiles nonnegative monotone'], scope: 'API checks only. No reactive gameplay test or deployment.', samplerSHA256: createHash('sha256').update(readFileSync(new URL('../../bot-starter/src/reference-gaucho/threshold-prior.ts', import.meta.url))).digest('hex') };
writeFileSync(new URL('./public-threshold-check.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
