import { writeFileSync } from 'node:fs';
import { ChampionStrategy } from '../../bot-starter/src/strategy.ts';
import { WordEngine, LETTER_VALUE } from '../../bot-starter/src/engine.ts';
import { loadDictionary, runMatch, createCompletionBaseline, createScoreGreedyBaseline, type SimContext, type SimStrategy } from '../../bot-starter/src/simulate.ts';
const dictionary=loadDictionary();
const engine=new WordEngine(dictionary);
function ours():SimStrategy{
 const p=new ChampionStrategy(dictionary,{bidScale:1.15,acquisitionShare:0.6,holdMargin:2.5,minimumBid:4,maximumSpendFraction:0.5,futureCost:1.2},engine);let initialRack:Map<string,number>|undefined;
 return {name:'Afterword',bid(c){initialRack??=new Map(c.myRack);return p.decideBid({...c,initialRack});},word(c){initialRack??=new Map(c.myRack);return p.chooseWord({...c,initialRack});}};
}
function patient(name:string,target:number,aggression:number):SimStrategy{
 let lastKey='',lastNear:ReturnType<WordEngine['nearWords']>=[];
 return {name,
 word(c){const words=engine.playable(c.myRack);if(!words.length)return null;
  if(c.roundsRemaining<=2)return engine.bestPacking(c.myRack,{timeBudgetMs:4,maxNodes:500}).words[0]??words[0].word;
  if(c.myBalance<10||c.roundsRemaining<=6||[...c.myRack.values()].reduce((s,n)=>s+n,0)>=15)return words[0].word;
  return words.find(w=>w.length>=target)?.word??null;},
 bid(c){if(c.roundsRemaining<=1)return 0;
  const key=[...c.myRack].sort().map(([s,n])=>s+n).join('');
  if(key!==lastKey){lastKey=key;lastNear=engine.nearWords(c.myRack,2);}
  const base=engine.playable(c.myRack)[0]?.score??0;
  let value=1+(LETTER_VALUE[c.letter]??1)*.8;
  for(const w of lastNear){if(!(w.missing.get(c.letter)??0))continue;
   if(w.missingCount===1)value=Math.max(value,(w.score-base)*aggression);
   else if(w.length>=target)value=Math.max(value,w.score*.12);
  }
  const vowels=[...c.myRack].filter(([l])=>'AEIOU'.includes(l)).reduce((n,[,k])=>n+k,0);
  if(vowels<2&&'AEIOU'.includes(c.letter))value=Math.max(value,5);
  const shade=c.auctionType==='FirstPrice'?.8:1;
  return Math.min(c.myBalance,Math.floor(c.myBalance*.5),Math.max(0,Math.floor(value*shade)));}};
}
function leaveGreedy():SimStrategy{return {name:'score-leave',word(c){
 const candidates=engine.playable(c.myRack);let best:string|null=null,bestValue=-Infinity;
 for(const w of candidates){let value=w.score;for(const[l,n]of c.myRack){const left=n-w.counts[l.charCodeAt(0)-65];value+=left*(1+(LETTER_VALUE[l]??0)*.7);}
  if(value>bestValue){best=w.word;bestValue=value;}}
 return best;},bid(c){if(c.roundsRemaining<=1)return 0;const next=new Map(c.myRack);next.set(c.letter,(next.get(c.letter)??0)+1);
 const gain=(engine.playable(next)[0]?.score??0)-(engine.playable(c.myRack)[0]?.score??0);
 return Math.min(c.myBalance,Math.floor(c.myBalance*.4),Math.max(2,(LETTER_VALUE[c.letter]??1)+1,Math.floor(gain*.9)));}};}
const factories=[ours,()=>createCompletionBaseline('completion-85'),()=>patient('patient-six',6,.95),()=>patient('patient-seven',7,1.25),leaveGreedy,()=>createScoreGreedyBaseline('score-greedy')];
const report:any={dictionary:dictionary.length,seeds:[],matches:0,errors:[],rows:factories.map(f=>({name:f().name,wins:0,score:0,balance:0,maxDecisionMs:0,seats:Array(6).fill(0)})),startedAt:new Date().toISOString()};
const started=performance.now();
for(let n=0;n<24;n++){
 const seed=1930071+n*7919; const rotation=n%6;const roster=factories.map((_,i)=>(i+rotation)%6);
 const match=runMatch(roster.map(i=>factories[i]()),seed,{dictionary,auctionType:n%2?'FirstPrice':'SecondPrice'});
 const top=Math.max(...match.players.map(p=>p.score)),ties=match.players.filter(p=>p.score===top).length;
 report.seeds.push(seed);report.matches++;report.errors.push(...match.errors);
 for(let seat=0;seat<6;seat++){const p=match.players[seat],row=report.rows[roster[seat]];row.score+=p.score;row.balance+=p.balance;row.seats[seat]++;row.maxDecisionMs=Math.max(row.maxDecisionMs,p.maxBidMs,p.maxWordMs);if(p.score===top)row.wins+=1/ties;}
 console.log(JSON.stringify({match:n+1,seed,type:n%2?'FirstPrice':'SecondPrice',scores:match.players.map(p=>({name:p.name,score:p.score})),errors:match.errors,maxMs:Math.max(...match.players.map(p=>Math.max(p.maxBidMs,p.maxWordMs)))}));
 writeFileSync('/tmp/scrabble-independent-benchmark-progress.json',JSON.stringify(report,null,2));
}
report.elapsedMs=performance.now()-started;report.finishedAt=new Date().toISOString();
for(const row of report.rows){row.winRate=row.wins/report.matches;row.meanScore=row.score/report.matches;row.meanBalance=row.balance/report.matches;}
writeFileSync('/tmp/scrabble-heldout-minbid4-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
