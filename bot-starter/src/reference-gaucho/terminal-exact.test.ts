import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { GauchoReference, compileDictionary } from './adapter.js';
import { bestPartition, spellableList } from './core/dict.js';
import { rackFromMap, VALUE } from './core/rules.js';
import { ExactTerminalStrategy, exactTerminalPartition } from './terminal-exact.js';

function rack(s: string): Map<string, number> { const r = new Map<string, number>(); for (const c of s) r.set(c, (r.get(c) ?? 0) + 1); return r; }
function reward(word: string): number { const face = [...word].reduce((n, c) => n + VALUE[c.charCodeAt(0) - 65]!, 0); return Math.floor(face * (word.length <= 3 ? 1 : word.length === 4 ? 1.5 : word.length === 5 ? 2 : word.length === 6 ? 2.5 : 3)); }
function remove(r: Map<string, number>, word: string): void { for (const c of word) { const n = r.get(c) ?? 0; assert.ok(n > 0, 'spent unavailable tile'); if (n === 1) r.delete(c); else r.set(c, n - 1); } }
function flush(p: {word(c:any):string|null}, letters: string): number { const r = rack(letters); let score = 0; for (let i = 0; i < 60; i++) { const word = p.word({myRack:r,myBalance:100,roundsRemaining:1,letter:'A'}); if (!word) return score; remove(r,word); score += reward(word); } throw new Error('flush did not terminate'); }
function brute(words: string[], initial: Map<string,number>): number {
  const memo = new Map<string,number>();
  const visit = (r:Map<string,number>):number => {
    const k=[...r].sort().map(([c,n])=>c+n).join(''),old=memo.get(k); if(old!==undefined)return old;
    let best=0; for(const word of words){const next=new Map(r);let ok=true;for(const c of word){const n=next.get(c)??0;if(!n){ok=false;break;}if(n===1)next.delete(c);else next.set(c,n-1);}if(ok)best=Math.max(best,reward(word)+visit(next));}
    memo.set(k,best);return best;
  };return visit(initial);
}
const high='ABCDJKQ', anagrams=Array.from({length:7},(_,i)=>high.slice(i)+high.slice(0,i)).concat([...high].reverse().join(''));
const branchWords=[...anagrams,'AHIJKLM','BCDNOPQ'];
const branchRack='AHIJKLMBCDNOPQ';
let fullDictionary: string[] | undefined;
function enableWords(): string[] { return fullDictionary ??= readFileSync(new URL('../../../spacetimedb/wordlist.txt',import.meta.url),'utf8').split('\n'); }

test('exact final liquidation escapes beam slots exhausted by eight anagrams', () => {
  const d=compileDictionary(branchWords),beam=bestPartition(d,rackFromMap(rack(branchRack)));
  assert.equal(beam.score,96);
  const solved=exactTerminalPartition(d,rackFromMap(rack(branchRack)));
  assert.ok(solved);assert.equal(solved.score,138);
  const base=new GauchoReference(branchWords,{terminalSafe:true}),exact=new ExactTerminalStrategy(new GauchoReference(branchWords,{terminalSafe:true}));
  assert.equal(flush(base,branchRack),96);assert.equal(flush(exact,branchRack),138);
});
test('exact penultimate all-in detects a gain hidden by the beam depth-eight cap', () => {
  const words=['AT','OR','EN','IS','DO'],letters='ATORENISDOATORENISD';
  const base=new GauchoReference(words,{terminalSafe:true}),exact=new ExactTerminalStrategy(new GauchoReference(words,{terminalSafe:true}));
  const ctx={myRack:rack(letters),myBalance:73,roundsRemaining:2,letter:'O',auctionType:'SecondPrice'};
  assert.equal(base.bid(ctx),0);assert.equal(exact.bid(ctx),73);
  assert.equal(flush(exact,letters+'O'),22);
});
test('real ENABLE final rack recovers twenty-one points the beam liquidation misses', () => {
  const letters='NKDTSHEOQIHP',full=compileDictionary(enableWords());
  // Restrict to every ENABLE word possible in this rack. This preserves the
  // complete search problem while keeping scheduler pressure out of the proof.
  const words=spellableList(full,rackFromMap(rack(letters)),full.n).map(i=>full.words[i]!);
  const base=new GauchoReference(words,{terminalSafe:true});
  assert.equal(flush(base,letters),52);
  // Concurrent full-dictionary startup in other test files may preempt a bounded
  // proof. Such attempts must stay feasible; one completed proof must find 73.
  let best=0;
  for(let attempt=0;attempt<6&&best<73;attempt++) {
    const exact=new ExactTerminalStrategy(new GauchoReference(words,{terminalSafe:true}),{timeBudgetMs:25});
    const score=flush(exact,letters);assert.ok(score>=52);best=Math.max(best,score);
  }
  assert.equal(best,73); // QOPHS + KITHED, instead of HIPSHOT + KEN.
});
test('a captured pre-purchase floor survives an unwanted tile and exhausted search budget', () => {
  const options={timeBudgetMs:20};
  const exact=new ExactTerminalStrategy(new GauchoReference(branchWords,{terminalSafe:true}),options);
  exact.bid({myRack:rack(branchRack),myBalance:73,roundsRemaining:2,letter:'Z'});
  options.timeBudgetMs=0;
  assert.equal(flush(exact,branchRack+'Z'),138);
});
test('even an expired pre-purchase proof preserves the complete original liquidation floor', () => {
  const exact=new ExactTerminalStrategy(new GauchoReference(branchWords,{terminalSafe:true}),{timeBudgetMs:0});
  exact.bid({myRack:rack(branchRack),myBalance:73,roundsRemaining:2,letter:'Z'});
  assert.ok(flush(exact,branchRack+'Z')>=96);
});
test('a cached optimal suffix survives a zero remaining search budget', () => {
  const options={timeBudgetMs:20};const exact=new ExactTerminalStrategy(new GauchoReference(branchWords,{terminalSafe:true}),options);
  const r=rack(branchRack),first=exact.word({myRack:r,roundsRemaining:1,myBalance:10,letter:'A'});assert.ok(first);remove(r,first);
  options.timeBudgetMs=0;
  const next=exact.word({myRack:r,roundsRemaining:1,myBalance:10,letter:'A'});assert.ok(next);assert.equal(reward(first)+reward(next),138);
});
test('expired exact search preserves the base decision', () => {
  const base=new GauchoReference(branchWords,{terminalSafe:true}),exact=new ExactTerminalStrategy(base,{timeBudgetMs:0});
  const ctx={myRack:rack(branchRack),myBalance:73,roundsRemaining:1,letter:'O'};
  assert.equal(exact.word(ctx),base.word(ctx));assert.equal(exact.bid(ctx),0);
});
test('earlier rounds are delegated without changing policy or caller state', () => {
  const words=['AX','ART','ARTS','CAR','CART'];const base=new GauchoReference(words,{terminalSafe:true}),exact=new ExactTerminalStrategy(base);
  const ctx={myRack:rack('AXCAR'),myBalance:37,roundsRemaining:8,letter:'T',auctionType:'SecondPrice'};
  const before=[...ctx.myRack];assert.equal(exact.word(ctx),base.word(ctx));assert.equal(exact.bid(ctx),base.bid(ctx));assert.deepEqual([...ctx.myRack],before);
});
test('exact packing and sequential payout agree with independent exhaustive small-rack search', () => {
  const words=['AA','AB','AC','BB','BC','CC','ABC','AAB','ABB','AAC','BCC','ABCA','ABBC','AABB','ABCCC'];
  const d=compileDictionary(words);
  let checked=0;
  for(let a=0;a<4;a++)for(let b=0;b<4;b++)for(let c=0;c<4;c++){
    if(a+b+c>8)continue;const letters='A'.repeat(a)+'B'.repeat(b)+'C'.repeat(c),r=rack(letters),expected=brute(words,r);
    const actual=exactTerminalPartition(d,rackFromMap(r));assert.ok(actual);assert.equal(actual.score,expected);
    const exact=new ExactTerminalStrategy(new GauchoReference(words,{terminalSafe:true}));
    const base=new GauchoReference(words,{terminalSafe:true});
    assert.equal(flush(exact,letters),expected);assert.ok(flush(exact,letters)>=flush(base,letters));checked++;
  }assert.ok(checked>60);
});
test('full-dictionary terminal work is bounded and does not construct another global engine', () => {
  const words=enableWords();
  const exact=new ExactTerminalStrategy(new GauchoReference(words,{terminalSafe:true}));
  const ctx={myRack:rack('AEINORSTAEINORST'),myBalance:73,roundsRemaining:2,letter:'S',auctionType:'SecondPrice'};
  const start=performance.now(),bid=exact.bid(ctx),ms=performance.now()-start;
  assert.ok(Number.isInteger(bid)&&bid>=0&&bid<=73);assert.ok(ms<150,`bounded terminal work took ${ms}ms`);
  console.info(`Exact terminal full dictionary: ${ms.toFixed(1)}ms`);
});
