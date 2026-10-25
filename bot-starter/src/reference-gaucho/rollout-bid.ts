/** Original experimental purchase-price Monte Carlo bidder. Word behavior is
 * unchanged. BUY-at-cost and LOSE share public-estimated sampled futures, actual
 * funded cashouts and final liquidation; no actual future/rival thresholds enter.
 */
import type { BidContext } from '../strategy.js';
import type { LastTilePolicy } from '../last-tile-denial.js';
import { GauchoReference } from './adapter.js';
import { createMarketRolloutValuation, type MarketRolloutValuation, type RolloutCashoutOptions } from './rollout-cashout.js';
export interface RolloutBidOptions { maximumRounds?:number; samples?:number; timeBudgetMs?:number; marketMarkup?:number; riskPenalty?:number; improvementMargin?:number; strength?:number }
export type RolloutBidFactory=(reference:GauchoReference,context:BidContext,options:RolloutCashoutOptions)=>MarketRolloutValuation|null;
export interface RolloutBidDecision { normal:number; chosen:number; ceiling:number; samples:number; expired:boolean; prices:Array<{price:number;meanGain:number;se:number;lowerGain:number}> }
const signature=(c:BidContext)=>`${c.round??0}|${c.letter}|${c.myBalance}|${[...c.myRack].sort(([a],[b])=>a.localeCompare(b)).map(([c,n])=>c+n).join('')}`;
export class RolloutBidStrategy implements LastTilePolicy {
 private initialRack?:Map<string,number>;private readonly cache=new Map<string,number>();lastDecision?:RolloutBidDecision;
 constructor(readonly base:LastTilePolicy,readonly reference:GauchoReference,readonly options:RolloutBidOptions={},readonly factory:RolloutBidFactory=createMarketRolloutValuation){}
 word(ctx:BidContext):string|null{this.initialRack??=new Map(ctx.initialRack??ctx.myRack);return this.base.word(ctx);}
 bid(ctx:BidContext):number{
  this.initialRack??=new Map(ctx.initialRack??ctx.myRack);
  const normal=this.base.bid(ctx),left=ctx.roundsRemaining??60,balance=Math.max(0,Math.floor(ctx.myBalance));
  if(ctx.auctionType==='FirstPrice'||left<=2||left>(this.options.maximumRounds??12)||balance<2)return normal;
  const key=signature(ctx);if(this.cache.has(key))return this.cache.get(key)!;
  const failure=()=>{this.lastDecision={normal,chosen:normal,ceiling:normal,samples:0,expired:true,prices:[]};return normal;};
  const model=this.factory(this.reference,{...ctx,initialRack:ctx.initialRack??this.initialRack},{samples:this.options.samples??4,timeBudgetMs:this.options.timeBudgetMs??70,maximumSteps:left-1,marketMarkup:this.options.marketMarkup??2});
  // A truncated leaf that discards future cash would overvalue early purchases.
  if(!model||!model.reachesFinalPayout)return failure();
  const lose=model.evaluatePurchase(null);if(!lose)return failure();
  const prices=[...new Set([0,Math.floor(normal*.5),normal,Math.ceil(normal*1.5),Math.round(Math.sqrt(Math.max(1,normal)*balance)),balance].map(p=>Math.max(0,Math.min(balance,p))))].sort((a,b)=>a-b);
  const values:RolloutBidDecision['prices']=[];let ceiling=0,profitable=true;
  for(const price of prices){
   const buy=model.evaluatePurchase(price);if(!buy||buy.length!==lose.length||buy.length<2)return failure();
   const deltas=buy.map((v,i)=>v-lose[i]!),mean=deltas.reduce((a,b)=>a+b,0)/deltas.length;
   const se=Math.sqrt(deltas.reduce((a,x)=>a+(x-mean)**2,0)/(deltas.length*(deltas.length-1)));
   const lowerGain=mean-(this.options.riskPenalty??.5)*se;
   values.push({price,meanGain:mean,se,lowerGain});
   // Require a connected profitable price interval. Cashout thresholds can make
   // isolated high-cost simulations look profitable; they do not justify a
   // truthful Vickrey bid that can also win at unprofitable lower prices.
   if(lowerGain<(this.options.improvementMargin??.5))profitable=false;
   if(profitable)ceiling=price;
  }
  const strength=Math.max(0,Math.min(1,this.options.strength??.6));
  const chosen=Math.max(0,Math.min(balance,Math.floor(normal+strength*(ceiling-normal))));
  this.lastDecision={normal,chosen,ceiling,samples:model.sampleCount,expired:false,prices:values};
  if(this.cache.size>=96)this.cache.delete(this.cache.keys().next().value!);this.cache.set(key,chosen);return chosen;
 }
}
