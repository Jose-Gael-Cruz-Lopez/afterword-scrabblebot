import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadDictionary, runMatch, type SimStrategy } from '../../bot-starter/src/simulate.ts';
import { GauchoReference } from '../../bot-starter/src/reference-gaucho/adapter.ts';
import { ExactTerminalStrategy } from '../../bot-starter/src/reference-gaucho/terminal-exact.ts';
const dictionary = loadDictionary();
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const hash=(p:string)=>createHash('sha256').update(readFileSync(ROOT+p)).digest('hex');
const count=Number(process.env.MATCH_PAIRS??24), start=Number(process.env.SEED_START??2026110701), output=process.env.REPORT??fileURLToPath(new URL('./gaucho-terminal-exact-reproduced-report.json',import.meta.url));
const report:any={method:'Counterfactual paired candidate replacement; five identical licensed Gaucho rivals; terminalSafe true for all; balanced six seats; fresh deterministic seeds; both auction modes',count,seedStart:start,hashes:Object.fromEntries(['bot-starter/src/reference-gaucho/adapter.ts','bot-starter/src/reference-gaucho/terminal-exact.ts','bot-starter/src/reference-gaucho/core/dict.ts','bot-starter/src/simulate.ts'].map(p=>[p,hash(p)])),matches:0,errors:[],paired:[],exactScore:0,controlScore:0,better:0,worse:0,equal:0,prefixDifferences:0,maxBidMs:0,maxWordMs:0};
const started=performance.now();
for(let i=0;i<count;i++){
 const seed=start+i, rotation=i%6;
 for(const mode of ['SecondPrice','FirstPrice'] as const){
  const run=(exact:boolean)=>{
   const factories=Array.from({length:6},(_,j)=>()=>{const base=new GauchoReference(dictionary,{name:j===0?'candidate':'licensed-rival-'+j,terminalSafe:true});return j===0&&exact?new ExactTerminalStrategy(base):base;});
   const order=factories.map((_,j)=>(j+rotation)%6), seat=order.indexOf(0);
   return {result:runMatch(order.map(j=>factories[j]()) as SimStrategy[],seed,{dictionary,auctionType:mode,trace:true}),seat};
  };
  const a=run(false), b=run(true), control=a.result.players[a.seat]!, exact=b.result.players[b.seat]!;
  const rank=(x:any,p:any)=>1+x.players.filter((q:any)=>q.score>p.score).length;
  const samePrefix=JSON.stringify(a.result.trace.filter(t=>t.round<a.result.auctions.length-1))===JSON.stringify(b.result.trace.filter(t=>t.round<a.result.auctions.length-1));
  report.errors.push(...a.result.errors,...b.result.errors);report.matches+=2;report.controlScore+=control.score;report.exactScore+=exact.score;
  if(exact.score>control.score)report.better++;else if(exact.score<control.score)report.worse++;else report.equal++;
  if(!samePrefix)report.prefixDifferences++;
  report.maxBidMs=Math.max(report.maxBidMs,exact.maxBidMs);report.maxWordMs=Math.max(report.maxWordMs,exact.maxWordMs);
  const pair={seed,mode,seat:a.seat,controlScore:control.score,exactScore:exact.score,delta:exact.score-control.score,controlRank:rank(a.result,control),exactRank:rank(b.result,exact),samePrefix,maxBidMs:exact.maxBidMs,maxWordMs:exact.maxWordMs,controlTail:a.result.trace.filter(t=>t.round>=a.result.auctions.length-1&&t.seat===a.seat),exactTail:b.result.trace.filter(t=>t.round>=a.result.auctions.length-1&&t.seat===b.seat)};
  report.paired.push(pair);writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({seed,mode,seat:a.seat,delta:pair.delta,controlScore:pair.controlScore,exactScore:pair.exactScore,controlRank:pair.controlRank,exactRank:pair.exactRank,samePrefix,maxBidMs:pair.maxBidMs,maxWordMs:pair.maxWordMs}));
 }
}
report.elapsedMs=performance.now()-started;report.exactMean=report.exactScore/report.paired.length;report.controlMean=report.controlScore/report.paired.length;
writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({complete:true,matches:report.matches,better:report.better,worse:report.worse,equal:report.equal,prefixDifferences:report.prefixDifferences,errors:report.errors.length,exactMean:report.exactMean,controlMean:report.controlMean,maxBidMs:report.maxBidMs,maxWordMs:report.maxWordMs,elapsedMs:report.elapsedMs}));
