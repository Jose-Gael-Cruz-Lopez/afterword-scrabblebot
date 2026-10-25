import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadDictionary,runMatch,type SimStrategy} from '../../bot-starter/src/simulate.ts';
import {GauchoReference} from '../../bot-starter/src/reference-gaucho/adapter.ts';
import {ExactTerminalStrategy} from '../../bot-starter/src/reference-gaucho/terminal-exact.ts';
import {ExactTerminalStrategy as PreviousExactTerminalStrategy} from './fixtures/terminal-before-score100/terminal-exact.ts';
import {GauchoReference as FrozenReference} from './fixtures/terminal-before-score100/adapter.ts';
import {LastTileDenial} from '../../bot-starter/src/last-tile-denial.ts';
const words=loadDictionary(),report:any={seedStart:2_974_100_433,method:'168 fresh matched Vickrey scenarios,84six-player and84seven-player, each seat14times/six-player or12times/seven-player, three rotating rival rosters (58,58,52 matched pairs). Controls/current exact+denial, candidate uses one shared constrained-letter search for terminal cashouts and final liquidation; controls and all rivals use both the frozen adapter and frozen exact solver from330d6a7. Rivals include five legacy exact(no denial), five denial clones, or mixture with mutantparams. No actual private holdings/bids used in decision.',pairs:[],errors:[],hashes:Object.fromEntries(['../../bot-starter/src/reference-gaucho/adapter.ts','../../bot-starter/src/reference-gaucho/terminal-exact.ts','../../bot-starter/src/reference-gaucho/terminal-search.ts'].map(f=>[f,createHash('sha256').update(readFileSync(new URL(f,import.meta.url))).digest('hex')]))};
for(let i=0;i<168;i++){
 const count=i<84?6:7,seat=(i<84?i:i-84)%count,roster=Math.floor((i<84?i:i-84)/count)%3;
 const results=[false,true].map(candidate=>{
 const actors=Array.from({length:count},(_,j):SimStrategy=>{
 const focal=j===seat,name=focal?'focal':'rival'+j;
 const reference=new (candidate&&focal?GauchoReference:FrozenReference)(words,{name,terminalSafe:true,overrides:roster===2&&!focal?(j%2?{minPlayReward:32,lowCash:16}:{c0:.7}):{}});
 const exact=candidate&&focal?new ExactTerminalStrategy(reference):new PreviousExactTerminalStrategy(reference);
 const core=focal||roster===1||roster===2&&j%2===0?new LastTileDenial(exact):exact;
 const policy=core;
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
writeFileSync(new URL('./shared-terminal-holdout-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({summary:report.summary,byCount:report.byCount,byRoster:report.byRoster,errors:report.errors.length},null,2));
