import { writeFileSync,readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadDictionary,runMatch,type SimStrategy } from '../../bot-starter/src/simulate.ts';
import { createGauchoReference } from '../../bot-starter/src/reference-gaucho/adapter.ts';
import { LiquidityStrategy } from '../../bot-starter/src/reference-gaucho/liquidity.ts';
const words=loadDictionary();
const config={stallRounds:6,minimumReward:24,maximumBalance:20,minimumHorizon:8};
const rosters=[ [{},{},{},{},{}], [{c0:.65,lowCash:18},{minPlayReward:48,maxMissing:3},{c0:.3},{minPlayReward:32,lowCash:16},{alpha:1.2}], [{c0:.7,minPlayReward:48},{c0:.3,lowCash:16},{beta:1.8},{minPlayReward:32},{maxMissing:3,pBase:.9,aHalf:.6}] ];
const report:any={seedStart:2027011101,config,method:'48 fixed fresh matched seed+seat+roster scenarios; only focal policy replaced. 24 per auction mode, each seat4times per mode, strong licensed clones/mutants. No tuning on these seeds.',pairs:[],errors:[],hashes:Object.fromEntries(['../../bot-starter/src/reference-gaucho/liquidity.ts','../../bot-starter/src/reference-gaucho/adapter.ts','../../bot-starter/src/simulate.ts'].map(f=>[f,createHash('sha256').update(readFileSync(new URL(f,import.meta.url))).digest('hex')]))};
for(let i=0;i<48;i++){
 const seat=i%6,mode=i<24?'SecondPrice':'FirstPrice',roster=rosters[Math.floor((i%24)/6)%3]!;
 const results=[false,true].map(candidate=>{
  let j=0;
  const players=Array.from({length:6},(_,s):SimStrategy=>{
   if(s===seat){if(candidate){const p=new LiquidityStrategy(words,{...config,name:'focal'});return{name:'focal',word:c=>p.word(c),bid:c=>p.bid(c)};}return createGauchoReference(words,{name:'focal',terminalSafe:true});}
   return createGauchoReference(words,{name:'opponent'+s,terminalSafe:true,overrides:roster[j++]!});
  });
  const r=runMatch(players,report.seedStart+i,{dictionary:words,auctionType:mode});report.errors.push(...r.errors);
  const own=r.players[seat]!,max=Math.max(...r.players.map(p=>p.score)),ties=r.players.filter(p=>p.score===max).length;
  return{score:own.score,rank:1+r.players.filter(p=>p.score>own.score).length,win:own.score===max?1/ties:0,cash:own.balance,maxMs:Math.max(own.maxWordMs,own.maxBidMs)};
 });
 report.pairs.push({seed:report.seedStart+i,seat,mode,roster:Math.floor((i%24)/6)%3,control:results[0],candidate:results[1]});
 if((i+1)%6===0)console.log('Completed',i+1,'pairs');
}
const summarize=(rows:any[])=>{const n=rows.length;const sum=(key:string,variant:string)=>rows.reduce((s,p)=>s+p[variant][key],0);const deltas=rows.map(p=>p.candidate.score-p.control.score),mean=deltas.reduce((a,b)=>a+b,0)/n;return{n,controlWins:sum('win','control'),candidateWins:sum('win','candidate'),controlScore:sum('score','control')/n,candidateScore:sum('score','candidate')/n,pairedScoreDelta:mean,pairedScoreSE:Math.sqrt(deltas.reduce((s,d)=>s+(d-mean)**2,0)/(n*(n-1))),improved:deltas.filter(d=>d>0).length,regressed:deltas.filter(d=>d<0).length,unchanged:deltas.filter(d=>d===0).length,maxCandidateMs:Math.max(...rows.map(p=>p.candidate.maxMs))};};
report.summary=summarize(report.pairs);report.modes=['SecondPrice','FirstPrice'].map(mode=>({mode,...summarize(report.pairs.filter(p=>p.mode===mode))}));
writeFileSync(new URL('./licensed-liquidity-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({summary:report.summary,modes:report.modes,errors:report.errors.length},null,2));
