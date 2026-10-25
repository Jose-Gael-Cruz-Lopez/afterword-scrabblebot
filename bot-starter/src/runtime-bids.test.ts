import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuctionBidDispatcher } from './runtime-bids.js';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('a delayed old auction never blocks submission to the next auction', async () => {
  const dispatcher = new AuctionBidDispatcher(), old = deferred();
  const sent: bigint[] = [], completed: bigint[] = [];
  dispatcher.submit(1n, () => { sent.push(1n); return old.promise; }, () => completed.push(1n), () => {}, () => {});
  dispatcher.submit(2n, async () => { sent.push(2n); }, () => completed.push(2n), () => {}, () => {});
  await tick();
  assert.deepEqual(sent, [1n, 2n]);
  assert.deepEqual(completed, [2n]);
  old.resolve(); await tick();
  assert.deepEqual(completed, [2n, 1n]);
});
test('same-auction replacements wait for their previous acknowledgement', async () => {
  const dispatcher = new AuctionBidDispatcher(), first = deferred();
  assert.equal(dispatcher.submit(1n, () => first.promise, () => {}, () => {}, () => {}), true);
  assert.equal(dispatcher.submit(1n, async () => {}, () => {}, () => {}, () => {}), false);
  first.resolve(); await tick();
  assert.equal(dispatcher.submit(1n, async () => {}, () => {}, () => {}, () => {}), true);
  await tick();
});
test('old errors settle independently and shutdown ignores pending callbacks', async () => {
  const dispatcher = new AuctionBidDispatcher(), old = deferred(), next = deferred();
  const errors: bigint[] = [], settled: bigint[] = [];
  dispatcher.submit(1n, () => old.promise, () => {}, () => errors.push(1n), () => settled.push(1n));
  dispatcher.submit(2n, () => next.promise, () => {}, () => errors.push(2n), () => settled.push(2n));
  old.reject(new Error('Auction closed')); await tick();
  assert.deepEqual(errors, [1n]); assert.deepEqual(settled, [1n]);
  dispatcher.close(); next.reject(new Error('Disconnected')); await tick();
  assert.deepEqual(errors, [1n]); assert.deepEqual(settled, [1n]);
  assert.equal(dispatcher.submit(3n, async () => {}, () => {}, () => {}, () => {}), false);
});
