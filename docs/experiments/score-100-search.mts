/** Vickrey-specific score search. Offline only; frozen train/holdout seeds. */
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadDictionary,runMatch,type SimStrategy,type SimContext} from '../../bot-starter/src/simulate.ts';
import {GauchoReference} from '../../bot-starter/src/reference-gaucho/adapter.ts';
import {ExactTerminalStrategy} from '../../bot-starter/src/reference-gaucho/terminal-exact.ts';
import {LastTileDenial} from '../../bot-starter/src/last-tile-denial.ts';
import type {Params} from '../../bot-starter/src/reference-gaucho/core/policy.ts';
const words=loadDictionary();
type Candidate={name:string,overrides:Partial<Params>,late?:Partial<Params>};
const candidates:Candidate[]=[
 {name:'two-word-025',overrides:{w2:.25}},
 {name:'two-word-06',overrides:{w2:.6}},
 {name:'two-word-1',overrides:{w2:1}},
 {name:'two-word-liquid',overrides:{w2:.6,lowCash:16}},
 {name:'earlier-terminal',overrides:{endN:5}},
 {name:'late-completions-only',overrides:{},late:{endN:8,beta:0,gamma:0,pace:0,floorMult:0}},
 {name:'more-tiles',overrides:{letterTarget:16,slack:1,floorMult:.9}},
 {name:'orphan-q-discount',overrides:{qW:.35}},
 {name:'idle-discount',overrides:{idleBeta:.3}},
 {name:'two-word-q',overrides:{w2:.6,qW:.35}},
 {name:'lower-cost',overrides:{c0:.2}},
 {name:'selective-cashout',overrides:{minPlayReward:28,holdKappa:.95}},
];
const rosters:Partial<Params>[][]=[
 [{},{},{},{},{}],
 [{c0:.7,lowCash:18},{minPlayReward:48,maxMissing:3,pBase:.9},{c0:.3},{minPlayReward:32,lowCash:16},{alpha:1.2}],
 [{c0:.3,minPlayReward:50},{letterTarget:16,slack:1},{beta:1.8},{minPlayReward:32,holdKappa:1},{maxMissing:3,pBase:.9,aHalf:.6}],
];
function policy(name:string,c:Candidate={name:'control',overrides:{}}):SimStrategy{
 const base=new LastTileDenial(new ExactTerminalStrategy(new GauchoReference(words,{name,overrides:c.overrides,terminalSafe:true})));
 const late=c.late?new LastTileDenial(new ExactTerminalStrategy(new GauchoReference(words,{name,overrides:{...c.overrides,...c.late},terminalSafe:true}))):base;
 let initialRack:Map<string,number>|undefined;
 const context=(ctx:SimContext)=>{initialRack??=new Map(ctx.myRack);return {...ctx,initialRack};};
 return{name,bid:ctx=>(ctx.roundsRemaining<=8?late:base).bid(context(ctx)),word:ctx=>(ctx.roundsRemaining<=8?late:base).word(context(ctx))};
}
interface Scenario{seed:number;seat:number;roster:number}
const scenarios=(n:number,start:number):Scenario[]=>Array.from({length:n},(_,i)=>({seed:start+i*7919,seat:i%6,roster:Math.floor(i/6)%3}));
let games=0;
const errors:string[]=[];
function play(s:Scenario,c?:Candidate){let k=0;const actors=Array.from({length:6},(_,seat)=>seat===s.seat?policy('focal',c):policy('opponent'+seat,{name:'opponent',overrides:rosters[s.roster]![k++]!}));
 const r=runMatch(actors,s.seed,{dictionary:words,auctionType:'SecondPrice'});games++;errors.push(...r.errors);
 const p=r.players[s.seat]!,max=Math.max(...r.players.map(p=>p.score));return{score:p.score,win:p.score===max?1/r.players.filter(p=>p.score===max).length:0,rank:1+r.players.filter(p=>p.score>r.players[s.seat]!.score).length,balance:p.balance,tiles:p.tilesWon,spent:p.spent,maxMs:Math.max(p.maxWordMs,p.maxBidMs)};
}
function summary(xs:any[]){return{games:xs.length,meanScore:xs.reduce((s,p)=>s+p.score,0)/xs.length,wins:xs.reduce((s,p)=>s+p.win,0),atLeast100:xs.filter(p=>p.score>=100).length,meanRank:xs.reduce((s,p)=>s+p.rank,0)/xs.length,meanBalance:xs.reduce((s,p)=>s+p.balance,0)/xs.length,maxMs:Math.max(...xs.map(p=>p.maxMs))};}
function paired(a:any[],b:any[]){const d=b.map((p,i)=>p.score-a[i].score),m=d.reduce((s,x)=>s+x,0)/d.length;return{meanScoreDelta:m,scoreDeltaSE:Math.sqrt(d.reduce((s,x)=>s+(x-m)**2,0)/(d.length*(d.length-1))),improvements:d.filter(x=>x>0).length,regressions:d.filter(x=>x<0).length,ties:d.filter(x=>x===0).length,winDelta:b.reduce((s,p,i)=>s+p.win-a[i].win,0)};}
const report:any={name:'score-100-search',startedAt:new Date().toISOString(),target:'Mean score and fraction >=100 in Vickrey; win rate retained as safety outcome',methodology:'Current exact+denial production composition. 36 fixed training scenarios cross every seat and three strong licensed clone/mutant rosters twice. Each candidate replaces only the same focal seat in a matched control scenario. Pick highest mean score before 72 untouched holdout pairs. No live data/credentials/future tiles.',candidates,rosters,sourceHashes:Object.fromEntries(['../../bot-starter/src/reference-gaucho/adapter.ts','../../bot-starter/src/reference-gaucho/terminal-exact.ts','../../bot-starter/src/simulate.ts'].map(f=>[f,createHash('sha256').update(readFileSync(new URL(f,import.meta.url))).digest('hex')])),training:[],errors};
const path=new URL('./score-100-search-report.json',import.meta.url),started=performance.now();
const save=()=>{report.games=games;report.elapsedMs=performance.now()-started;writeFileSync(path,JSON.stringify(report,null,2)+'\n');};
const train=scenarios(36,1_557_001_031);const controls=train.map(s=>play(s));report.train={scenarios:train,control:summary(controls),outcomes:controls};console.log(JSON.stringify({stage:'control',...report.train.control}));
for(const c of candidates){const out=train.map(s=>play(s,c)),row={candidate:c,summary:summary(out),paired:paired(controls,out),outcomes:out};report.training.push(row);save();console.log(JSON.stringify({stage:'train',name:c.name,...row.summary,...row.paired,elapsedMs:report.elapsedMs}));}
const selected=[...report.training].sort((a,b)=>b.summary.meanScore-a.summary.meanScore)[0].candidate;report.selectedBeforeHoldout=selected;save();
const holdout=scenarios(72,1_757_001_071),a:any[]=[],b:any[]=[];
for(const s of holdout){a.push(play(s));b.push(play(s,selected));if(a.length%12===0)console.log(JSON.stringify({stage:'holdout',pairs:a.length,games}));}
report.holdout={scenarios:holdout,control:summary(a),candidate:summary(b),paired:paired(a,b),controlOutcomes:a,candidateOutcomes:b};report.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({stage:'complete',selected,...report.holdout,controlOutcomes:undefined,candidateOutcomes:undefined,scenarios:undefined,errors:errors.length,elapsedMs:report.elapsedMs}));
