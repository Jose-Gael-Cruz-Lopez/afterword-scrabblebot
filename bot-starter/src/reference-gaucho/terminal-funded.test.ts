import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GauchoReference, compileDictionary } from './adapter.js';
import { ExactTerminalStrategy, terminalCashoutFrontier } from './terminal-exact.js';
import { FundedTerminalStrategy } from './terminal-funded.js';
import { LastTileDenial } from '../last-tile-denial.js';
import { rackFromMap } from './core/rules.js';
const rack = (s: string) => { const r = new Map<string, number>(); for (const c of s) r.set(c, (r.get(c) ?? 0) + 1); return r; };
function make(words: string[]) { const ref = new GauchoReference(words, { terminalSafe: true }); return new FundedTerminalStrategy(new LastTileDenial(new ExactTerminalStrategy(ref)), ref.dictionary); }
test('cashout/purchase frontier distinguishes funded payout from unaffordable ideal', () => {
  const d = compileDictionary(['PAIRING', 'PRAYING', 'OY']);
  const choices = terminalCashoutFrontier(d, rackFromMap(rack('PAIRINGO')), 24)!;
  assert.ok(choices); assert.deepEqual(choices.find(c => c.word === null), {word:null,credit:0,loseScore:30,winScore:39});
  assert.deepEqual(choices.find(c => c.word === 'PAIRING'), {word:'PAIRING',credit:30,loseScore:30,winScore:35});
});
test('funds a reachable final purchase while preserving the lose-case payout', () => {
  const policy = make(['PAIRING', 'PRAYING', 'OY']);
  const ctx = {myRack:rack('PAIRINGO'),myBalance:11,letter:'Y',roundsRemaining:2,seat:0,players:[{seat:0,balance:11,score:42},{seat:1,balance:32,score:70}]};
  assert.equal(policy.word(ctx), 'PAIRING');
  assert.equal(policy.word({...ctx,myRack:rack('O'),myBalance:41}), null);
  assert.equal(policy.bid({...ctx,myRack:rack('O'),myBalance:41}), 41);
  assert.equal(policy.word({...ctx,myRack:rack('OY'),myBalance:9,roundsRemaining:1}), 'OY');
});
test('holds the best combination when its purchase is already affordable', () => {
  const policy=make(['ART','ARTS']);
  assert.equal(policy.word({myRack:rack('ART'),myBalance:100,letter:'S',roundsRemaining:2,seat:0,players:[{seat:0,balance:100,score:0},{seat:1,balance:30,score:0}]}),null);
});
test('an incomplete proof exposes no speculative cashout frontier', () => {
  assert.equal(terminalCashoutFrontier(compileDictionary(['ART','ARTS']),rackFromMap(rack('ART')),18,{timeBudgetMs:0}),null);
});
