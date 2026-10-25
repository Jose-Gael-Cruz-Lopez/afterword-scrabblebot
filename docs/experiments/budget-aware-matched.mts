import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadDictionary,runMatch,type SimStrategy} from '../../bot-starter/src/simulate.ts';
import {GauchoReference} from '../../bot-starter/src/reference-gaucho/adapter.ts';
import {ExactTerminalStrategy} from '../../bot-starter/src/reference-gaucho/terminal-exact.ts';
import {ExactTerminalStrategy as PreviousExactTerminalStrategy} from './fixtures/terminal-before-score100/terminal-exact.ts';
import {BudgetAwareStrategy} from '../../bot-starter/src/reference-gaucho/budget-aware.ts';
import {LastTileDenial} from '../../bot-starter/src/last-tile-denial.ts';
const words=loadDictionary(),report:any={seedStart:2_467_600_229,method:'84 fresh matched Vickrey scenarios,42six-player and42seven-player, each seat7times/six-player or6times/seven-player, three rival rosters equally. Controls/current exact+denial, candidate adds budget-aware confidence/cashout model and constrained-letter recursion; control/rivals use frozen solver from330d6a7. Rivals include five legacy exact(no denial), five denial clones, or mixture with mutantparams. No actual private holdings/bids used in decision.',pairs:[],errors:[],hashes:Object.fromEntries(['../../bot-starter/src/reference-gaucho/budget-aware.ts','../../bot-starter/src/reference-gaucho/terminal-exact.ts'].map(f=>[f,createHash('sha256').update(readFileSync(new URL(f,import.meta.url))).digest('hex')]))};
for(let i=0;i<84;i++){
 const count=i<42?6:7,seat=(i<42?i:i-42)%count,roster=Math.floor((i<42?i:i-42)/count)%3;
 const results=[false,true].map(candidate=>{
 const actors=Array.from({length:count},(_,j):SimStrategy=>{
 const focal=j===seat,name=focal?'focal':'rival'+j;
 const reference=new GauchoReference(words,{name,terminalSafe:true,overrides:roster===2&&!focal?(j%2?{minPlayReward:32,lowCash:16}:{c0:.7}):{}});
 const exact=candidate&&focal?new ExactTerminalStrategy(reference):new PreviousExactTerminalStrategy(reference);
 const core=focal||roster===1||roster===2&&j%2===0?new LastTileDenial(exact):exact;
 const policy=candidate&&focal?new BudgetAwareStrategy(words,{reservePurchases:3}):core;
 return{name,word:c=>policy.word(c),bid:c=>policy.bid(c)};
 });
 const r=runMatch(actors,report.seedStart+i*7919,{dictionary:words,auctionType:'SecondPrice'});report.errors.push(...r.errors);
 const p=r.players[seat]!,top=Math.max(...r.players.map(p=>p.score));
 return{score:p.score,win:p.score===top?1/r.players.filter(p=>p.score===top).length:0,rank:1+r.players.filter(p=>p.score>r.players[seat]!.score).length,maxMs:Math.max(p.maxWordMs,p.maxBidMs)};
 });
 report.pairs.push({seed:report.seedStart+i*7919,seat,roster,count,control:results[0],candidate:results[1]});
 if((i+1)%12===0)console.log('Completed',i+1,'pairs');
}
const summarize=(rows:any[])=>{const n=rows.length,s=(key:string,v:string)=>rows.reduce((a,r)=>a+r[v][key],0),d=rows.map(r=>r.candidate.score-r.control.score),m=d.reduce((a,b)=>a+b,0)/n;return{n,controlScore:s('score','control')/n,candidateScore:s('score','candidate')/n,controlWins:s('win','control'),candidateWins:s('win','candidate'),delta:m,SE:Math.sqrt(d.reduce((a,x)=>a+(x-m)**2,0)/(n*(n-1))),improved:d.filter(x=>x>0).length,regressed:d.filter(x=>x<0).length,unchanged:d.filter(x=>!x).length,maxMs:Math.max(...rows.map(r=>r.candidate.maxMs))};};
report.summary=summarize(report.pairs);report.byCount=[6,7].map(count=>({count,...summarize(report.pairs.filter(p=>p.count===count))}));report.byRoster=[0,1,2].map(roster=>({roster,...summarize(report.pairs.filter(p=>p.roster===roster))}));
writeFileSync(new URL('./budget-aware-matched-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({summary:report.summary,byCount:report.byCount,byRoster:report.byRoster,errors:report.errors.length},null,2));
