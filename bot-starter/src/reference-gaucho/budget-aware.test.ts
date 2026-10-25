import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BudgetAwareStrategy } from './budget-aware.js';
import { GauchoReference } from './adapter.js';
import { LastTileDenial } from '../last-tile-denial.js';
import { ExactTerminalStrategy } from './terminal-exact.js';
const rack = (s:string) => { const r=new Map<string,number>();for(const c of s)r.set(c,(r.get(c)??0)+1);return r; };
const ctx={myRack:rack('JOCKQUIZ'),myBalance:15,letter:'E',roundsRemaining:20,round:49};
test('scarce funds can monetize a mature word without changing an ample-bankroll decision',()=>{
  const p=new BudgetAwareStrategy(['JOCK','QUIZ']);assert.equal(p.word(ctx),'QUIZ');
  assert.equal(p.word({...ctx,myBalance:100}),null);
});
test('terminal policy and current bid cash limits stay intact',()=>{
  const words=['ART','ARTS','AX'];const p=new BudgetAwareStrategy(words);
  const baseline=new LastTileDenial(new ExactTerminalStrategy(new GauchoReference(words,{terminalSafe:true})));
  for(const left of [1,2]){const c={...ctx,myRack:rack('ART'),letter:'S',roundsRemaining:left};assert.equal(p.word(c),baseline.word(c));assert.equal(p.bid(c),baseline.bid(c));}
  for(const cash of [0,1,9,30,100]){const bid=p.bid({...ctx,myRack:rack('ART'),letter:'S',myBalance:cash});assert.ok(Number.isInteger(bid)&&bid>=0&&bid<=cash);}
});
