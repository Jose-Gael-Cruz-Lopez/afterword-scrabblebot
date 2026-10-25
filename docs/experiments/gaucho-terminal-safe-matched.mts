/**
 * Reproduce the matched terminal-safe comparison from the repository root:
 *   bot-starter/node_modules/.bin/tsx docs/experiments/gaucho-terminal-safe-matched.mts
 * No server connection, tokens or private account information are used.
 * The adjacent report records every source hash and each paired terminal trace.
 */
import {writeFileSync,readFileSync} from 'node:fs';import{createHash}from'node:crypto';
import {loadDictionary,runMatch,type SimStrategy,type SimContext} from '../../bot-starter/src/simulate.ts';
import {createGauchoReference} from '../../bot-starter/src/reference-gaucho/adapter.ts';
import {createStrategy} from '../../bot-starter/src/strategy.ts';
import {WordEngine} from '../../bot-starter/src/engine.ts';
const sourceRoot = new URL('../../bot-starter/src/', import.meta.url);
const sourceFiles = ['simulate.ts','strategy.ts','engine.ts','reference-gaucho/adapter.ts','reference-gaucho/UPSTREAM.json','reference-gaucho/core/policy.ts','reference-gaucho/core/dict.ts','reference-gaucho/core/rules.ts','reference-gaucho/core/prices.ts','reference-gaucho/params/vickrey.json','reference-gaucho/params/firstprice.json','reference-gaucho/params/market-paid.json','reference-gaucho/LICENSE'];
const sourceSha256 = Object.fromEntries(sourceFiles.map(path => [path, createHash('sha256').update(readFileSync(new URL(path,sourceRoot))).digest('hex')]));
const upstream = JSON.parse(readFileSync(new URL('reference-gaucho/UPSTREAM.json',sourceRoot),'utf8'));
for (const file of upstream.files) {
 const bytes=readFileSync(new URL('reference-gaucho/'+file.path,sourceRoot));
 const blob=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
 if(blob!==file.git_blob_sha)throw new Error('Vendored upstream content changed: '+file.path);
}
const output = new URL('./gaucho-terminal-safe-matched-report.json',import.meta.url);
const dictionary=loadDictionary(),engine=new WordEngine(dictionary);
function ours():SimStrategy{const p=createStrategy(dictionary,{bidScale:2,minimumBid:4,maximumSpendFraction:.7,acquisitionShare:.6,holdMargin:2.5,futureCost:1.2,marketRebuild:false});let initialRack:Map<string,number>|undefined;const ctx=(c:SimContext)=>{initialRack??=new Map(c.myRack);return{...c,initialRack}};return{name:'corrected-original',word:c=>p.chooseWord(ctx(c)),bid:c=>p.decideBid(ctx(c))};}
function pressure(price:number):SimStrategy{return{name:'pressure-'+price,word:c=>engine.playable(c.myRack)[0]?.word??null,bid:c=>c.roundsRemaining<=1?0:Math.min(c.myBalance,price)}};

const r:any={methodology:'Counterfactual paired runs: same seed, seat, hidden starting rack and opponents; only candidate terminalSafe flag changes. Every pre-terminal event is compared.',sourceSha256,upstreamCommit:upstream.commit,seedStart:2026110101,params:{bidScale:2,minimumBid:4,maximumSpendFraction:.7,acquisitionShare:.6,holdMargin:2.5,futureCost:1.2,marketRebuild:false},matches:0,seeds:[],errors:[],paired:[],safeScore:0,untouchedScore:0,safeBetter:0,untouchedBetter:0,equal:0,prefixDifferences:0};
const started=performance.now();
for(let i=0;i<24;i++){
 const seed=2026110101+i,rotation=i%6;
 const run=(safe:boolean)=>{const factories=[()=>createGauchoReference(dictionary,{name:'candidate',terminalSafe:safe}),()=>createGauchoReference(dictionary,{name:'rival',terminalSafe:false}),ours,()=>pressure(14),()=>pressure(16),()=>pressure(18)];const order=factories.map((_,j)=>(j+rotation)%6);return {result:runMatch(order.map(j=>factories[j]()),seed,{dictionary,auctionType:'SecondPrice',trace:true}),seat:order.indexOf(0)};};
 const a=run(false),b=run(true),oldScore=a.result.players[a.seat].score,newScore=b.result.players[b.seat].score;
 const before=(x:any)=>JSON.stringify(x.trace.filter((t:any)=>t.round<67));
 const samePrefix=before(a.result)===before(b.result);
 r.errors.push(...a.result.errors,...b.result.errors);r.matches+=2;r.seeds.push(seed);r.safeScore+=newScore;r.untouchedScore+=oldScore;
 if(newScore>oldScore)r.safeBetter++;else if(oldScore>newScore)r.untouchedBetter++;else r.equal++;
 if(!samePrefix)r.prefixDifferences++;
 r.paired.push({seed,seat:a.seat,oldScore,newScore,delta:newScore-oldScore,samePrefix,oldTail:a.result.trace.filter((t:any)=>t.round>=67&&t.seat===a.seat),newTail:b.result.trace.filter((t:any)=>t.round>=67&&t.seat===b.seat)});
 writeFileSync(output,JSON.stringify(r,null,2));console.log(JSON.stringify(r.paired[r.paired.length-1]));
}
r.elapsedMs=performance.now()-started;r.safeMean=r.safeScore/24;r.untouchedMean=r.untouchedScore/24;
writeFileSync(output,JSON.stringify(r,null,2));console.log(JSON.stringify(r,null,2));
if(r.errors.length||r.prefixDifferences)throw new Error('Matched verification failed: invalid actions or unequal pre-terminal histories; inspect the saved report.');
