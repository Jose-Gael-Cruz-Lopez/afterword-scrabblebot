import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadDictionary,runMatch,type SimStrategy} from '../../bot-starter/src/simulate.ts';
import {GauchoReference} from '../../bot-starter/src/reference-gaucho/adapter.ts';
import {ExactTerminalStrategy} from '../../bot-starter/src/reference-gaucho/terminal-exact.ts';
import {FundedTerminalStrategy} from '../../bot-starter/src/reference-gaucho/terminal-funded.ts';
import {LastTileDenial} from '../../bot-starter/src/last-tile-denial.ts';
const words=loadDictionary(),report:any={seedStart:1_867_000_109,method:'72 fresh matched Vickrey scenario pairs, each seat12times, three rival rosters equally. Controls/current exact+denial, candidate adds funded terminal frontier. Rivals include five legacy exact(no denial), five denial clones, or mixture with mutantparams. No actual private holdings/bids used in decision.',pairs:[],errors:[],hashes:Object.fromEntries(['../../bot-starter/src/reference-gaucho/terminal-funded.ts','../../bot-starter/src/reference-gaucho/terminal-exact.ts'].map(f=>[f,createHash('sha256').update(readFileSync(new URL(f,import.meta.url))).digest('hex')]))};
for(let i=0;i<72;i++){
 const seat=i%6,roster=Math.floor(i/6)%3;
 const results=[false,true].map(candidate=>{
 const actors=Array.from({length:6},(_,j):SimStrategy=>{
 const focal=j===seat,name=focal?'focal':'rival'+j;
 const reference=new GauchoReference(words,{name,terminalSafe:true,overrides:roster===2&&!focal?(j%2?{minPlayReward:32,lowCash:16}:{c0:.7}):{}});
 const exact=new ExactTerminalStrategy(reference);
 const core=focal||roster===1||roster===2&&j%2===0?new LastTileDenial(exact):exact;
 const policy=candidate&&focal?new FundedTerminalStrategy(core,reference.dictionary):core;
 return{name,word:c=>policy.word(c),bid:c=>policy.bid(c)};
 });
 const r=runMatch(actors,report.seedStart+i*7919,{dictionary:words,auctionType:'SecondPrice'});report.errors.push(...r.errors);
 const p=r.players[seat]!,top=Math.max(...r.players.map(p=>p.score));
 return{score:p.score,win:p.score===top?1/r.players.filter(p=>p.score===top).length:0,rank:1+r.players.filter(p=>p.score>r.players[seat]!.score).length,maxMs:Math.max(p.maxWordMs,p.maxBidMs)};
 });
 report.pairs.push({seed:report.seedStart+i*7919,seat,roster,control:results[0],candidate:results[1]});
 if((i+1)%12===0)console.log('Completed',i+1,'pairs');
}
const summarize=(rows:any[])=>{const n=rows.length,s=(key:string,v:string)=>rows.reduce((a,r)=>a+r[v][key],0),d=rows.map(r=>r.candidate.score-r.control.score),m=d.reduce((a,b)=>a+b,0)/n;return{n,controlScore:s('score','control')/n,candidateScore:s('score','candidate')/n,controlWins:s('win','control'),candidateWins:s('win','candidate'),delta:m,SE:Math.sqrt(d.reduce((a,x)=>a+(x-m)**2,0)/(n*(n-1))),improved:d.filter(x=>x>0).length,regressed:d.filter(x=>x<0).length,unchanged:d.filter(x=>!x).length,maxMs:Math.max(...rows.map(r=>r.candidate.maxMs))};};
report.summary=summarize(report.pairs);report.byRoster=[0,1,2].map(roster=>({roster,...summarize(report.pairs.filter(p=>p.roster===roster))}));
writeFileSync(new URL('./funded-terminal-matched-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({summary:report.summary,byRoster:report.byRoster,errors:report.errors.length},null,2));
