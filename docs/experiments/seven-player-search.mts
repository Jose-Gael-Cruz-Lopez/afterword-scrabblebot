import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadDictionary,runMatch,type SimStrategy} from '../../bot-starter/src/simulate.ts';
import {GauchoReference} from '../../bot-starter/src/reference-gaucho/adapter.ts';
import {ExactTerminalStrategy} from '../../bot-starter/src/reference-gaucho/terminal-exact.ts';
import {ExactTerminalStrategy as PreviousExact} from './fixtures/terminal-before-score100/terminal-exact.ts';
import {LastTileDenial} from '../../bot-starter/src/last-tile-denial.ts';
import type {Params} from '../../bot-starter/src/reference-gaucho/core/policy.ts';
const words=loadDictionary(),n=7,pressure=(n/(98-5*n))/(6/68);
const candidates=[
 {name:'price-pressure',overrides:{c0:.472+Math.log(pressure)}},
 {name:'population-cashflow',overrides:{minPlayReward:40.551*(6/n)**2,lowCash:14}},
 {name:'price-and-cashflow',overrides:{c0:.472+Math.log(n/6),minPlayReward:30,lowCash:14}},
 {name:'scarce-completion',overrides:{pBase:.95*Math.sqrt(6/n),minPlayReward:30,lowCash:14}},
 {name:'balanced-market',overrides:{c0:.472+Math.log(n/6),pBase:.95*Math.sqrt(6/n),minPlayReward:30,lowCash:12}},
 {name:'selective-pressure',overrides:{c0:.472+Math.log(pressure),alpha:1.1,beta:1.3,minPlayReward:30,lowCash:12,qW:.35}},
 {name:'efficient-share',overrides:{floorMult:.796*pressure,letterTarget:12.016*6/n,minPlayReward:30,lowCash:14}},
 {name:'early-liquidity',overrides:{minPlayReward:26,lowCash:18,holdKappa:.9,pBase:.88}},
];
const rosters:Partial<Params>[][]=[ [{},{},{},{},{},{}], [{c0:.7},{minPlayReward:32,lowCash:16},{minPlayReward:48},{alpha:1.2},{c0:.3},{}], [{beta:1.8},{minPlayReward:30,lowCash:18},{maxMissing:3,pBase:.9,aHalf:.6},{minPlayReward:50},{c0:.7},{c0:.3,minPlayReward:32}] ];
function policy(name:string,overrides:Partial<Params>={},modern=false):SimStrategy{const ref=new GauchoReference(words,{name,overrides,terminalSafe:true});const p=new LastTileDenial(modern?new ExactTerminalStrategy(ref):new PreviousExact(ref));return{name,word:c=>p.word(c),bid:c=>p.bid(c)};}
const report:any={startedAt:new Date().toISOString(),players:7,pressure,candidates,rosters,method:'All Vickrey.42matched training scenarios (each seven-player seat6times and roster14times), then84untouched matched holdout scenarios. Select highest training mean score among candidates whose training wins do not decline. Control and rivals frozen330d6a7 solver; final candidate also uses constrained-letter recursion. No live process changes.',training:[],errors:[]};
const scenarios=(count:number,start:number)=>Array.from({length:count},(_,i)=>({seed:start+i*7919,seat:i%7,roster:Math.floor(i/7)%3}));
let games=0;
function play(s:any,overrides:Partial<Params>={},modern=false){let k=0;const actors=Array.from({length:7},(_,j)=>j===s.seat?policy('focal',overrides,modern):policy('rival'+j,rosters[s.roster]![k++]!));const r=runMatch(actors,s.seed,{dictionary:words,auctionType:'SecondPrice'});games++;report.errors.push(...r.errors);const p=r.players[s.seat]!,top=Math.max(...r.players.map(p=>p.score));return{score:p.score,win:p.score===top?1/r.players.filter(p=>p.score===top).length:0,rank:1+r.players.filter(q=>q.score>p.score).length,balance:p.balance,tiles:p.tilesWon,maxMs:Math.max(p.maxWordMs,p.maxBidMs)};}
function summary(xs:any[]){return{n:xs.length,meanScore:xs.reduce((a,p)=>a+p.score,0)/xs.length,wins:xs.reduce((a,p)=>a+p.win,0),atLeast100:xs.filter(p=>p.score>=100).length,meanRank:xs.reduce((a,p)=>a+p.rank,0)/xs.length,meanTiles:xs.reduce((a,p)=>a+p.tiles,0)/xs.length,maxMs:Math.max(...xs.map(p=>p.maxMs))};}
function paired(a:any[],b:any[]){const d=b.map((p,i)=>p.score-a[i].score),m=d.reduce((a,b)=>a+b,0)/d.length;return{scoreDelta:m,SE:Math.sqrt(d.reduce((a,x)=>a+(x-m)**2,0)/(d.length*(d.length-1))),winsDelta:b.reduce((s,p,i)=>s+p.win-a[i].win,0),improved:d.filter(x=>x>0).length,regressed:d.filter(x=>x<0).length,unchanged:d.filter(x=>!x).length};}
const path=new URL('./seven-player-search-report.json',import.meta.url),started=performance.now(),save=()=>{report.games=games;report.elapsedMs=performance.now()-started;writeFileSync(path,JSON.stringify(report,null,2)+'\n');};
const train=scenarios(42,2_267_400_211),a=train.map(s=>play(s));report.trainingControl=summary(a);console.log(JSON.stringify({stage:'control',...summary(a)}));
for(const c of candidates){const b=train.map(s=>play(s,c.overrides)),row={candidate:c,summary:summary(b),paired:paired(a,b),outcomes:b};report.training.push(row);save();console.log(JSON.stringify({stage:'train',name:c.name,...row.summary,...row.paired}));}
const eligible=report.training.filter(r=>r.paired.winsDelta>=0&&r.paired.scoreDelta>0);const chosen=(eligible.length?eligible:report.training).sort((a,b)=>b.summary.meanScore-a.summary.meanScore)[0].candidate;report.chosenBeforeHoldout=chosen;save();
const hold=scenarios(84,2_367_500_223),ha:any[]=[],hb:any[]=[];
for(const s of hold){ha.push(play(s));hb.push(play(s,chosen.overrides,true));if(ha.length%14===0)console.log(JSON.stringify({stage:'holdout',pairs:ha.length,games}));}
report.holdout={scenarios:hold,control:summary(ha),candidate:summary(hb),paired:paired(ha,hb),controlOutcomes:ha,candidateOutcomes:hb};report.sourceHashes=Object.fromEntries(['../../bot-starter/src/reference-gaucho/adapter.ts','../../bot-starter/src/reference-gaucho/terminal-exact.ts','./fixtures/terminal-before-score100/terminal-exact.ts'].map(f=>[f,createHash('sha256').update(readFileSync(new URL(f,import.meta.url))).digest('hex')]));save();console.log(JSON.stringify({stage:'complete',chosen,control:summary(ha),candidate:summary(hb),paired:paired(ha,hb),errors:report.errors.length,games,elapsedMs:report.elapsedMs}));
