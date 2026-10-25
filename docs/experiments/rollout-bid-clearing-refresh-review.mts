/** Post-hoc first-divergence review. Actual future events are used only to
 * reconstruct the fixed initial own deal; no future event enters valuation. */
import {readFileSync,writeFileSync} from 'node:fs';
import {loadDictionary} from '../../bot-starter/src/simulate.ts';
import {GauchoReference} from '../../bot-starter/src/reference-gaucho/adapter.ts';
import {ExactTerminalStrategy} from '../../bot-starter/src/reference-gaucho/terminal-exact.ts';
import {LastTileDenial} from '../../bot-starter/src/last-tile-denial.ts';
import {ClearingPriceRolloutBidStrategy} from '../../bot-starter/src/reference-gaucho/rollout-bid-clearing.ts';
import {createMarketRolloutValuation} from '../../bot-starter/src/reference-gaucho/rollout-cashout.ts';
import {sampleRivalThreshold} from '../../bot-starter/src/reference-gaucho/threshold-prior.ts';
const main=JSON.parse(readFileSync(new URL('./rollout-bid-clearing-refresh-long-confirmation-report.json',import.meta.url),'utf8'));
if(!main.finishedAt)throw new Error('Wait for frozen confirmation');
const dictionary=loadDictionary(),selected=main.selectedBeforeHoldout;
const examples=Object.entries(main.traceExamples).flatMap(([category,rows])=>(rows as any[]).map(row=>({category,...row})));
const results=examples.map(example=>{
 const {scenario,controlTrace,candidateTrace}=example,seat=scenario.seat;
 const a=new Map<number,number>(controlTrace.events.filter((e:any)=>e.kind==='bid'&&e.seat===seat).map((e:any)=>[e.round,e.amount]));
 const first=candidateTrace.events.find((e:any)=>e.kind==='bid'&&e.seat===seat&&a.get(e.round)!==e.amount);
 if(!first)return{category:example.category,scenario,control:example.control,candidate:example.candidate,firstDivergence:null,caveat:'No own bid changed in this trace; inspect timer/tie or word divergence separately.'};
 const trace=candidateTrace,initial=new Map<string,number>(trace.ownFinalRack);
 const adjust=(word:string,sign:number)=>{for(const c of word)initial.set(c,(initial.get(c)??0)+sign);};
 for(const word of trace.ownWords)adjust(word,1);
 for(const auction of trace.auctions)if(auction.winner===seat)adjust(auction.letter,-1);
 for(const[c,n]of initial)if(n===0)initial.delete(c);else if(n<0)throw new Error('Invalid reconstructed initial own deal');
 if([...initial.values()].reduce((n,v)=>n+v,0)!==5)throw new Error('Initial own deal must contain five tiles');
 const history=trace.auctions.filter((e:any)=>e.round<first.round),words=trace.events.filter((e:any)=>e.kind==='word'&&e.round<=first.round);
 const rack=new Map(initial);for(const h of history)if(h.winner===seat)rack.set(h.letter,(rack.get(h.letter)??0)+1);
 for(const w of words)if(w.seat===seat)for(const c of w.word){const n=(rack.get(c)??0)-1;if(n<0)throw new Error('Invalid pre-bid rack');if(n===0)rack.delete(c);else rack.set(c,n);}
 const players=Array.from({length:scenario.players},(_,index)=>{const score=words.filter((w:any)=>w.seat===index).reduce((n:number,w:any)=>n+w.reward,0);return{seat:index,score,balance:100+score-history.filter((h:any)=>h.winner===index).reduce((n:number,h:any)=>n+h.paid,0)};});
 const ctx={seat,letter:trace.auctions.find((e:any)=>e.round===first.round).letter,round:first.round,roundsRemaining:98-5*scenario.players-first.round+1,myRack:rack,initialRack:initial,myBalance:players[seat]!.balance,players,history,publicWords:words.map((w:any)=>({seat:w.seat,word:w.word,reward:w.reward,round:w.round})),auctionType:'SecondPrice',dictionary};
 const reference=new GauchoReference(dictionary,{terminalSafe:true}),base=new LastTileDenial(new ExactTerminalStrategy(reference,{timeBudgetMs:18,maxNodes:8000}));
 const policy=new ClearingPriceRolloutBidStrategy(base,reference,selected.options,(r,c,o)=>createMarketRolloutValuation(r,c,{...o,refreshAfterPurchases:3,sampleThreshold:(future,letter,rng)=>sampleRivalThreshold({...future,letter},rng,{clampToPublicBalances:false})}));
 const replayed=policy.bid(ctx);
 return{category:example.category,scenario,control:example.control,candidate:example.candidate,firstDivergence:{round:ctx.round,left:ctx.roundsRemaining,letter:ctx.letter,rack:[...rack].map(([c,n])=>c.repeat(n)).join(''),balance:ctx.myBalance,controlBid:a.get(first.round),candidateBid:first.amount,recomputedBid:replayed,reproduced:replayed===first.amount,decision:policy.lastDecision},caveat:'Post-hoc model reproduction is timing-bounded; recorded game outcomes remain authoritative. Future events were not passed to the model.'};
});
writeFileSync(new URL('./rollout-bid-clearing-refresh-review-report.json',import.meta.url),JSON.stringify({selected,diagnosticOnly:true,results},null,2)+'\n');
console.log(JSON.stringify(results.map(({category,scenario,firstDivergence})=>({category,seed:scenario.seed,firstDivergence}))));
