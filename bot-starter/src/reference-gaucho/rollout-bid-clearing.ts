/** Offline Vickrey policy: integrate funded purchase gain over public clearing
 * price uncertainty, permitting nonmonotone cashout-driven marginal values.
 * One common future bundle is shared across every actual purchase cost.
 */
import type { BidContext } from '../strategy.js';
import type { LastTilePolicy } from '../last-tile-denial.js';
import { GauchoReference } from './adapter.js';
import { createMarketRolloutValuation, type MarketRolloutValuation } from './rollout-cashout.js';
import { estimateRivalThreshold, sampleRivalThreshold } from './threshold-prior.js';
import type { RolloutBidOptions, RolloutBidFactory } from './rollout-bid.js';
export interface ClearingBidOptions extends RolloutBidOptions {thresholdSamples?:number}
export interface ClearingBidDecision {normal:number;chosen:number;optimal:number;expired:boolean;prices:Array<{threshold:number;cost:number;weight:number;meanGain:number}>;bids:Array<{bid:number;meanGain:number;se:number;lowerGain:number}>}
// Current clearing-price quantiles are capped by public rival cash. A rival's
// same-auction cashout changes that cap even when our own rack/cash is unchanged.
const signature=(c:BidContext)=>`${c.round??0}|${c.letter}|${c.myBalance}|${c.seat??-1}|${[...c.myRack].sort(([a],[b])=>a.localeCompare(b)).map(([c,n])=>c+n).join('')}|${(c.players??[]).map((p,index)=>`${p.seat??index}:${p.balance}:${p.score}`).join(',')}`;
const defaultFactory:RolloutBidFactory=(r,c,o)=>createMarketRolloutValuation(r,c,{...o,sampleThreshold:(future,letter,rng)=>sampleRivalThreshold({...future,letter},rng,{clampToPublicBalances:false})});
export class ClearingPriceRolloutBidStrategy implements LastTilePolicy {
 private initialRack?:Map<string,number>;private readonly cache=new Map<string,number>();lastDecision?:ClearingBidDecision;
 constructor(readonly base:LastTilePolicy,readonly reference:GauchoReference,readonly options:ClearingBidOptions={},readonly factory:RolloutBidFactory=defaultFactory,readonly threshold:(ctx:BidContext,q:number)=>number=estimateRivalThreshold){}
 word(ctx:BidContext):string|null{this.initialRack??=new Map(ctx.initialRack??ctx.myRack);return this.base.word(ctx);}
 bid(ctx:BidContext):number{
  this.initialRack??=new Map(ctx.initialRack??ctx.myRack);const normal=this.base.bid(ctx),left=ctx.roundsRemaining??60,balance=Math.max(0,Math.floor(ctx.myBalance));
  if(ctx.auctionType==='FirstPrice'||left<=2||left>(this.options.maximumRounds??10)||balance<2)return normal;
  const key=signature(ctx);if(this.cache.has(key))return this.cache.get(key)!;
  const failure=()=>{this.lastDecision={normal,chosen:normal,optimal:normal,expired:true,prices:[],bids:[]};return normal;};
  const bundle=this.factory(this.reference,{...ctx,initialRack:ctx.initialRack??this.initialRack},{samples:this.options.samples??4,timeBudgetMs:this.options.timeBudgetMs??70,maximumSteps:left-1});
  if(!bundle||!bundle.reachesFinalPayout)return failure();
  const lose=bundle.evaluatePurchase(null);if(!lose||lose.length<2)return failure();
  const count=Math.max(4,Math.min(64,Math.floor(this.options.thresholdSamples??16))),mass=new Map<number,number>();
  for(let i=0;i<count;i++){const threshold=Math.max(0,Math.floor(this.threshold(ctx,(i+.5)/count)));mass.set(threshold,(mass.get(threshold)??0)+1/count);}
  const rows:Array<{threshold:number;cost:number;weight:number;deltas:number[]}>=[],costs=new Map<number,number[]>();
  for(const[threshold,weight]of[...mass].sort(([a],[b])=>a-b)){
   const cost=Math.max(1,threshold);if(threshold>=balance||cost>balance)continue;
   let buy=costs.get(cost);if(!buy){const result=bundle.evaluatePurchase(cost);if(!result||result.length!==lose.length)return failure();buy=result;costs.set(cost,result);}
   rows.push({threshold,cost,weight,deltas:buy.map((v,i)=>v-lose[i]!)});
  }
  const outcomes=(bid:number)=>lose.map((_,i)=>rows.reduce((sum,r)=>sum+(bid>r.threshold?r.weight*r.deltas[i]!:0),0));
  const baseline=outcomes(normal),bidValues=[...new Set([0,normal,balance,...rows.map(r=>r.threshold+1)])].filter(b=>b>=0&&b<=balance).sort((a,b)=>a-b);
  const decisions:ClearingBidDecision['bids']=[];let optimal=normal,best=this.options.improvementMargin??.5;
  for(const bid of bidValues){const gain=outcomes(bid).map((v,i)=>v-baseline[i]!),mean=gain.reduce((s,v)=>s+v,0)/gain.length,se=Math.sqrt(gain.reduce((s,v)=>s+(v-mean)**2,0)/(gain.length*(gain.length-1))),lowerGain=mean-(this.options.riskPenalty??.5)*se;decisions.push({bid,meanGain:mean,se,lowerGain});if(lowerGain>best){best=lowerGain;optimal=bid;}}
  const strength=Math.max(0,Math.min(1,this.options.strength??1)),chosen=Math.max(0,Math.min(balance,Math.round(normal+strength*(optimal-normal))));
  this.lastDecision={normal,chosen,optimal,expired:false,prices:rows.map(({threshold,cost,weight,deltas})=>({threshold,cost,weight,meanGain:deltas.reduce((s,v)=>s+v,0)/deltas.length})),bids:decisions};
  if(this.cache.size>=96)this.cache.delete(this.cache.keys().next().value!);this.cache.set(key,chosen);return chosen;
 }
}
