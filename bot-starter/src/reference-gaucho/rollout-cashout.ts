/** Original experimental cashout policy: compare WAIT and distinct legal sales
 * using common sampled public-market futures and funded Gaucho continuations.
 * No hidden racks, bids, actual future bag, or production parameters are read.
 */
import type { BidContext } from '../strategy.js';
import type { LastTilePolicy } from '../last-tile-denial.js';
import { GauchoReference, type GauchoContext } from './adapter.js';
import { bestPartition, potential, type Dict } from './core/dict.js';
import { chooseWords, decideBid, DEFAULT_PARAMS, type Params, type View } from './core/policy.js';
import { BAG, VALUE, rackFromMap } from './core/rules.js';
import vickrey from './params/vickrey.json' with { type: 'json' };
import firstprice from './params/firstprice.json' with { type: 'json' };
import paidMarket from './params/market-paid.json' with { type: 'json' };
export interface RolloutCashoutOptions {
 maximumRounds?:number;samples?:number;maximumActions?:number;timeBudgetMs?:number;
 improvementMargin?:number;riskPenalty?:number;marketMarkup?:number;allowHold?:boolean;minimumReward?:number;
 maximumSteps?:number;
 /** Refresh after this many hypothetical acquisitions, and after a cashout.
  * This lets long rollouts rebuild targets beyond the original near-word set. */
 refreshAfterPurchases?:number;
 /** Optional genuine rival-winning threshold prior. It replaces paid+markup. */
 sampleThreshold?:(context:GauchoContext & BidContext,letter:string,rng:()=>number)=>number;
}
export interface MarketRolloutValuation {
 readonly sampleCount:number;readonly horizon:number;readonly reachesFinalPayout:boolean;
 /** null forces LOSE; a numeric actual cost forces BUY, if affordable. */
 evaluatePurchase(price:number|null):number[]|null;
}
export interface RolloutDecision {normal:string|null;chosen:string|null;values:{word:string|null;mean:number}[];samples:number;expired:boolean}
interface Action {word:string|null;index:number;credit:number}
interface Sample {letters:number[];prices:number[]}
const EXPIRED=Symbol('rollout cashout deadline');
function random(seed:number):()=>number{let a=seed>>>0;return()=>{a=(a+0x6d2b79f5)>>>0;let t=Math.imul(a^(a>>>15),1|a);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};}
function remove(d:Dict,r:Int32Array,k:number,sign=-1):void{for(let i=0;i<26;i++)r[i]!+=sign*d.counts[k*26+i]!;}
function total(r:Int32Array):number{return r.reduce((s,n)=>s+n,0);}
function copySubset(d:Dict,indices:number[]):Dict{
 indices.sort((a,b)=>a-b);const n=indices.length,out:Dict={n,words:[],counts:new Uint8Array(n*26),len:new Uint8Array(n),rew:new Uint16Array(n),mask:new Int32Array(n)};
 indices.forEach((k,j)=>{out.words[j]=d.words[k]!;out.counts.set(d.counts.subarray(k*26,k*26+26),j*26);out.len[j]=d.len[k]!;out.rew[j]=d.rew[k]!;out.mask[j]=d.mask[k]!;});return out;
}
export class RolloutCashoutStrategy implements LastTilePolicy{
 readonly name:string;lastDecision?:RolloutDecision;private initialRack?:Map<string,number>;private readonly cached=new Map<string,string|null>();private changedRound=-1;
 constructor(readonly base:LastTilePolicy,readonly reference:GauchoReference,readonly options:RolloutCashoutOptions={}){this.name=reference.name;}
 bid(ctx:GauchoContext & BidContext):number{this.initialRack??=new Map(ctx.initialRack??ctx.myRack);return this.base.bid(ctx);}
 private unseen(ctx:GauchoContext & BidContext):Int32Array{
  this.initialRack??=new Map(ctx.initialRack??ctx.myRack);const r=Int32Array.from(BAG);
  const take=(c:string,n=1)=>{const i=c.charCodeAt(0)-65;if(i>=0&&i<26)r[i]=Math.max(0,r[i]!-n);};
  for(const[c,n]of ctx.initialRack??this.initialRack)take(c,n);for(const h of ctx.history??[])take(h.letter);if(ctx.letter)take(ctx.letter);return r;
 }
 private local(r:Int32Array,deadline:number):{d:Dict;legal:number[]}{
  const d=this.reference.dictionary,picks:number[]=[],legal:number[]=[],seen=new Set<string>(),counts=[0,0,0,0],quotas=[144,176,208,112],size=total(r);let short=0;
  for(let k=0;k<d.n;k++){
   if((k&4095)===0&&performance.now()>=deadline)throw EXPIRED;
   if(d.len[k]!>size+3)continue;
   let miss=0;for(let i=0;i<26;i++){miss+=Math.max(0,d.counts[k*26+i]!-r[i]!);if(miss>3)break;}if(miss>3)continue;
   const guaranteedShort=d.len[k]===2&&short<128;
   if(!guaranteedShort&&counts[miss]!>=quotas[miss]!)continue;
   const signature=d.counts.subarray(k*26,k*26+26).join(',');if(seen.has(signature))continue;seen.add(signature);
   picks.push(k);if(guaranteedShort)short++;else counts[miss]!++;
   if(miss===0)legal.push(k);
  }return{d:copySubset(d,picks),legal};
 }
 private samples(ctx:GauchoContext & BidContext,u:Int32Array,n:number,horizon:number):Sample[]{
  const start=(ctx.round??1)*2654435761+total(rackFromMap(ctx.myRack))*2246822519;
  const history=(ctx.history??[]).slice(-36).filter(h=>h.paid>0);
  const prices=Array.from({length:26},(_,i)=>{const same=history.filter(h=>h.letter.charCodeAt(0)-65===i).map(h=>h.paid);return same.length>=3?same:history.filter(h=>Math.abs(VALUE[h.letter.charCodeAt(0)-65]!-VALUE[i]!)<=1).map(h=>h.paid);});
  const phase=Math.min(4,Math.floor(((ctx.round??1)-1)*5/Math.max(1,(ctx.round??1)+(ctx.roundsRemaining??60)-1)));
  return Array.from({length:n},(_,s)=>{const rng=random(start+s*0x9e3779b9),thresholdRng=random(start+s*0x9e3779b9+0x482aeb95),bag=new Int32Array(u),letters:number[]=[],costs:number[]=[];
   for(let step=0;step<horizon;step++){
    let letter=(ctx.letter??'A').charCodeAt(0)-65;
    if(step){let pick=rng()*total(bag);letter=25;for(let i=0;i<26;i++){pick-=bag[i]!;if(pick<0){letter=i;break;}}if(bag[letter]!>0)bag[letter]!--;}
    const observed=prices[letter]!,fallback=paidMarket[letter]?.[phase]??12;
    // Paid prices are public runner-up observations, not the hidden maximum.
    let price=(observed.length>=4?observed[Math.floor(rng()*observed.length)]!:fallback)+(this.options.marketMarkup??2);
    if(this.options.sampleThreshold){
     const name=String.fromCharCode(65+letter),future={...ctx,letter:name,round:(ctx.round??1)+step,roundsRemaining:(ctx.roundsRemaining??60)-step};
     const threshold=this.options.sampleThreshold(future,name,thresholdRng);
     if(Number.isFinite(threshold)&&threshold>=0)price=threshold;
    }
    letters.push(letter);costs.push(Math.max(1,Math.round(price)));
   }return{letters,prices:costs};});
 }
 private rollout(ctx:GauchoContext & BidContext,d:Dict,action:Action,sample:Sample,u:Int32Array,p:Params,deadline:number,forcedPurchase?:number|null,universes?:Map<string,Dict>):number{
  const r=rackFromMap(ctx.myRack),unseen=new Int32Array(u);let balance=Math.max(0,ctx.myBalance??100),score=action.credit;
  if(action.index>=0){remove(this.reference.dictionary,r,action.index);balance+=action.credit;}
  let scope=d,acquired=0,refreshDue=action.index>=0;const refresh=this.options.refreshAfterPurchases??0;
  const refreshUniverse=()=>{const k=r.join(',');let next=universes?.get(k);if(!next){next=this.local(r,deadline).d;universes?.set(k,next);}scope=next;acquired=0;refreshDue=false;};
  const initialLeft=(ctx.roundsRemaining??60)-1;let won=(ctx.history??[]).filter(h=>h.winner===ctx.seat).length;
  for(let step=0;step<sample.letters.length;step++){
   if(performance.now()>=deadline)throw EXPIRED;
   if(refresh>0&&refreshDue)refreshUniverse();
   const auctionsLeft=initialLeft-step,letter=sample.letters[step]!;
   if(step>0&&unseen[letter]!>0)unseen[letter]!--;
   const view:View={rack:r,balance,unseen,auctionsLeft,firstPrice:ctx.auctionType==='FirstPrice',won,round:(ctx.round??1)+step,market:paidMarket};
   // Preserve final combinations; avoid upstream's premature final-sale trigger.
   if((step>0||action.index>=0)&&auctionsLeft>1)for(let repeat=0;repeat<8;repeat++){
    view.balance=balance;const word=chooseWords(scope,p,view)[0];if(!word)break;const k=scope.words.indexOf(word);remove(scope,r,k);balance+=scope.rew[k]!;score+=scope.rew[k]!;refreshDue=true;
   }
   if(step===0&&forcedPurchase!==undefined){
    if(forcedPurchase!==null&&forcedPurchase<=balance){r[letter]!++;balance-=forcedPurchase;won++;acquired++;}
   }else{
    view.balance=balance;const bid=auctionsLeft===1?balance:decideBid(scope,p,view,letter),price=sample.prices[step]!;
    if(bid>price&&balance>=price){r[letter]!++;balance-=view.firstPrice?bid:price;won++;acquired++;}
   }
   if(refresh>0&&acquired>=refresh)refreshDue=true;
  }
  if(refresh>0&&refreshDue)refreshUniverse();
  return score+bestPartition(scope,r,8,12).score;
 }
 /** Reusable common-random-number public-market scenario bundle. The horizon
  * includes the known current tile and excludes the final unusable award.
  * For purchase decisions prefer reachesFinalPayout:true: an intermediate
  * packing leaf alone does not value unspent capital beyond its horizon.
  */
 marketValuation(ctx:GauchoContext & BidContext):MarketRolloutValuation|null{
  ctx={...ctx,myRack:new Map(ctx.myRack),initialRack:ctx.initialRack?new Map(ctx.initialRack):undefined,history:ctx.history?.map(h=>({...h}))};
  const deadline=performance.now()+Math.max(0,Math.min(80,this.options.timeBudgetMs??70));
  try{
   const r=rackFromMap(ctx.myRack),{d}=this.local(r,deadline),u=this.unseen(ctx);
   const p:Params={...DEFAULT_PARAMS,...(ctx.auctionType==='FirstPrice'?firstprice:vickrey)};
   const n=Math.max(2,Math.min(16,Math.floor(this.options.samples??4)));
   const available=Math.max(0,(ctx.roundsRemaining??60)-1),horizon=Math.min(available,Math.max(1,Math.floor(this.options.maximumSteps??10)));
   const samples=this.samples(ctx,u,n,horizon),universes=new Map<string,Dict>();
   return{sampleCount:n,horizon,reachesFinalPayout:horizon===available,evaluatePurchase:(price:number|null)=>{
    if(price!==null&&(!Number.isFinite(price)||price<0||price>ctx.myBalance))return null;
    try{return samples.map(s=>this.rollout(ctx,d,{word:null,index:-1,credit:0},s,u,p,deadline,price,universes));}
    catch(error){if(error!==EXPIRED)throw error;return null;}
   }};
  }catch(error){if(error!==EXPIRED)throw error;return null;}
 }
 word(ctx:GauchoContext & BidContext):string|null{
  this.initialRack??=new Map(ctx.initialRack??ctx.myRack);
  const normal=this.base.word(ctx),left=ctx.roundsRemaining??60,r=rackFromMap(ctx.myRack);
  if(ctx.round!==undefined&&ctx.round===this.changedRound)return normal;
  if(left<4||left>(this.options.maximumRounds??16)||total(r)<4||ctx.myBalance>65)return normal;
  const cacheKey=`${ctx.round??0}|${ctx.letter}|${ctx.myBalance}|${r.join(',')}`;if(this.cached.has(cacheKey))return this.cached.get(cacheKey)!;
  const deadline=performance.now()+Math.max(0,Math.min(80,this.options.timeBudgetMs??45));
  try{
   const {d,legal}=this.local(r,deadline),u=this.unseen(ctx),params:Params={...DEFAULT_PARAMS,...(ctx.auctionType==='FirstPrice'?firstprice:vickrey)};
   const eligible=legal.filter(k=>this.reference.dictionary.rew[k]!>=(this.options.minimumReward??8));if(!eligible.length)return normal;
   const o={unseen:u,maxMissing:2,pBase:params.pBase,aHalf:params.aHalf,minLen:params.minLen};
   const ranked=eligible.map(k=>{const rest=new Int32Array(r);remove(this.reference.dictionary,rest,k);return{k,value:this.reference.dictionary.rew[k]!+potential(d,rest,o)};}).sort((a,b)=>b.value-a.value);
   const indices=[...new Set([...(normal?[this.reference.dictionary.words.indexOf(normal)]:[]),eligible[0]!,...ranked.slice(0,this.options.maximumActions??4).map(v=>v.k)])].filter(k=>k>=0).slice(0,this.options.maximumActions??4);
   const actions:Action[]=[{word:null,index:-1,credit:0},...indices.map(index=>({word:this.reference.dictionary.words[index]!,index,credit:this.reference.dictionary.rew[index]!}))];
   const n=Math.max(2,Math.floor(this.options.samples??4)),samples=this.samples(ctx,u,n,Math.min(left-1,this.options.maximumSteps??left-1)),universes=new Map<string,Dict>();
   const values=actions.map(a=>samples.map(s=>this.rollout(ctx,d,a,s,u,params,deadline,undefined,universes)));
   const normalIndex=actions.findIndex(a=>a.word===normal),baseline=values[Math.max(0,normalIndex)]!;let chosen=Math.max(0,normalIndex),bestGain=this.options.improvementMargin??2;
   for(let j=0;j<actions.length;j++){
    if(j===0&&normal&&!this.options.allowHold)continue;
    const deltas=values[j]!.map((v,s)=>v-baseline[s]!),mean=deltas.reduce((a,b)=>a+b,0)/n,se=Math.sqrt(deltas.reduce((a,x)=>a+(x-mean)**2,0)/(n*(n-1)));
    const gain=mean-(this.options.riskPenalty??.5)*se;if(gain>bestGain){bestGain=gain;chosen=j;}
   }
   const answer=actions[chosen]!.word;this.lastDecision={normal,chosen:answer,values:actions.map((a,i)=>({word:a.word,mean:values[i]!.reduce((a,b)=>a+b,0)/n})),samples:n,expired:false};
   if(answer&&answer!==normal&&ctx.round!==undefined)this.changedRound=ctx.round;
   if(this.cached.size>128)this.cached.clear();this.cached.set(cacheKey,answer);return answer;
  }catch(error){if(error!==EXPIRED)throw error;this.lastDecision={normal,chosen:normal,values:[],samples:0,expired:true};return normal;}
 }
}
/** Independent valuer; callers can keep their actual word policy unchanged. */
export function createMarketRolloutValuation(reference:GauchoReference,ctx:GauchoContext & BidContext,options:RolloutCashoutOptions={}):MarketRolloutValuation|null{
 return new RolloutCashoutStrategy({word:()=>null,bid:()=>0},reference,options).marketValuation(ctx);
}
