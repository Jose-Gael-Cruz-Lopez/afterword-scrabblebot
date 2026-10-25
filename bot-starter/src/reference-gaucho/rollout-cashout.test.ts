import assert from 'node:assert/strict';
import {test} from 'node:test';
import {GauchoReference,type GauchoContext} from './adapter.js';
import {ExactTerminalStrategy} from './terminal-exact.js';
import {LastTileDenial} from '../last-tile-denial.js';
import {RolloutCashoutStrategy,createMarketRolloutValuation} from './rollout-cashout.js';
import {BAG} from './core/rules.js';
import type {BidContext} from '../strategy.js';
const words=['AX','CAR','CART'];
function rack(s:string){const r=new Map<string,number>();for(const c of s)r.set(c,(r.get(c)??0)+1);return r;}
function context(balance=12):GauchoContext & BidContext {
 const initial=rack('AXCAR'),left=Int32Array.from(BAG);for(const[c,n]of initial)left[c.charCodeAt(0)-65]!-=n;
 left[19]!--;left[21]!-=2;left[22]!--;
 const history=Array.from(left).flatMap((n,i)=>Array.from({length:n},()=>({letter:String.fromCharCode(65+i),paid:15,winner:1,round:0}))).map((h,i)=>({...h,round:i+1}));
 return{myRack:new Map(initial),initialRack:initial,myBalance:balance,letter:'T',roundsRemaining:4,round:history.length+1,seat:0,history,auctionType:'SecondPrice'};
}
function policy(options={}){const ref=new GauchoReference(words,{terminalSafe:true});return new RolloutCashoutStrategy(new LastTileDenial(new ExactTerminalStrategy(ref)),ref,{timeBudgetMs:80,improvementMargin:1,riskPenalty:0,...options});}
test('cashout unlocks an otherwise unaffordable current completion, including its leftover letters',()=>{
 const p=policy(),c=context();assert.equal(p.base.word(c),null);assert.equal(p.word(c),'AX');
 assert.ok(p.lastDecision);assert.ok(p.lastDecision.values.find(x=>x.word==='AX')!.mean>p.lastDecision.values.find(x=>x.word===null)!.mean);
});
test('an already funded rack is retained when the same sale adds no rollout score',()=>{
 const p=policy(),c=context(40);assert.equal(p.word(c),null);
});
test('expired rollout and protected terminal rounds preserve the full baseline',()=>{
 const p=policy({timeBudgetMs:0}),c=context();assert.equal(p.word(c),p.base.word(c));assert.equal(p.lastDecision?.expired,true);
 const last={...context(),roundsRemaining:2};assert.equal(p.word(last),p.base.word(last));assert.equal(p.bid(last),12);
});
test('planning is deterministic, keeps private input immutable, and does not change the bid policy',()=>{
 const a=policy(),b=policy(),c=context(),before=JSON.stringify([...c.myRack]),history=JSON.stringify(c.history);
 assert.equal(a.word(c),b.word(c));assert.equal(JSON.stringify([...c.myRack]),before);assert.equal(JSON.stringify(c.history),history);
 assert.equal(a.bid(c),a.base.bid(c));
});
test('reusable purchase valuation shares futures, debits real purchase cost, and rejects unaffordable costs',()=>{
 const c=context(),ref=new GauchoReference(words,{terminalSafe:true});
 const v=createMarketRolloutValuation(ref,c,{maximumSteps:3,samples:4,timeBudgetMs:80});assert.ok(v);
 assert.equal(v.horizon,3);assert.equal(v.reachesFinalPayout,true);
 const lose=v.evaluatePurchase(null),buy=v.evaluatePurchase(12);assert.ok(lose);assert.ok(buy);
 assert.ok(buy.every((x,i)=>x>lose[i]!));assert.deepEqual(v.evaluatePurchase(12),buy);
 assert.equal(v.evaluatePurchase(13),null);assert.equal(c.myBalance,12);assert.deepEqual([...c.myRack],[...rack('AXCAR')]);
});
test('a supplied rival-threshold prior controls future affordability without changing the shared tile paths',()=>{
 const c=context(),ref=new GauchoReference([...words,'CAV'],{terminalSafe:true});
 const cheapLetters:string[]=[],costlyLetters:string[]=[];
 const cheap=createMarketRolloutValuation(ref,c,{maximumSteps:3,samples:4,timeBudgetMs:80,sampleThreshold:(future,letter)=>{cheapLetters.push(`${future.round}:${letter}`);return 1;}});
 const costly=createMarketRolloutValuation(ref,c,{maximumSteps:3,samples:4,timeBudgetMs:80,sampleThreshold:(future,letter,rng)=>{costlyLetters.push(`${future.round}:${letter}`);rng();rng();return 100;}});
 assert.ok(cheap);assert.ok(costly);const a=cheap.evaluatePurchase(null),b=costly.evaluatePurchase(null);assert.ok(a);assert.ok(b);
 assert.deepEqual(cheapLetters,costlyLetters,'price-model randomness must not change the shared tile futures');
 assert.ok(a.reduce((s,x)=>s+x,0)>b.reduce((s,x)=>s+x,0));
});
