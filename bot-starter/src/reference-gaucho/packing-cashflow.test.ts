import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GauchoReference } from './adapter.js';
import { PackingCashflowStrategy } from './packing-cashflow.js';
import { ExactTerminalStrategy } from './terminal-exact.js';
import { LastTileDenial } from '../last-tile-denial.js';
const rack = (s: string) => { const r = new Map<string,number>(); for(const c of s)r.set(c,(r.get(c)??0)+1);return r; };
function make(words: string[]) {const ref=new GauchoReference(words,{terminalSafe:true});return new PackingCashflowStrategy(new LastTileDenial(new ExactTerminalStrategy(ref)),ref);}
const ctx={myRack:rack('JOCKQUIZ'),myBalance:15,letter:'E',roundsRemaining:20,round:49,auctionType:'SecondPrice'};
test('multiword cashflow recognizes a mature bundle despite a subthreshold individual word',()=>{
  const ref=new GauchoReference(['JOCK','QUIZ'],{terminalSafe:true});assert.equal(ref.word(ctx),null);
  assert.equal(make(['JOCK','QUIZ']).word(ctx),'QUIZ');
  assert.deepEqual([...ctx.myRack],[...rack('JOCKQUIZ')]);
});
test('a valuable reachable combined target can outweigh selling either mature word',()=>{
  assert.equal(make(['JOCK','QUIZ','JOCKQUIZA']).word(ctx),null);
});
test('cashflow exception preserves ample-bankroll and terminal decisions',()=>{
  const p=make(['JOCK','QUIZ']);assert.equal(p.word({...ctx,myBalance:80}),null);
  const ref=new LastTileDenial(new ExactTerminalStrategy(new GauchoReference(['JOCK','QUIZ'],{terminalSafe:true})));
  assert.equal(p.word({...ctx,roundsRemaining:2}),ref.word({...ctx,roundsRemaining:2}));
});
