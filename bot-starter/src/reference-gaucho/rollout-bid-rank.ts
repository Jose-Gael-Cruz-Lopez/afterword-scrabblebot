/** Offline rank-aware alternative to expected-score purchase valuation.
 * Rival final payouts are deliberately uncertain public-data estimates. No
 * opponent rack, sealed bid, actual future tile or threshold is consumed.
 */
import type { BidContext } from '../strategy.js';
import type { LastTilePolicy } from '../last-tile-denial.js';
import { GauchoReference } from './adapter.js';
import { createMarketRolloutValuation } from './rollout-cashout.js';
import { RolloutBidStrategy, type RolloutBidOptions } from './rollout-bid.js';
export interface RankRolloutOptions extends RolloutBidOptions {
 /** Fraction of utility assigned to probability of finishing first. */
 winWeight?:number;
 /** Residual opponent points per publicly estimated unspent tile. */
 pointsPerTile?:number;
 /** Additional forecast uncertainty; prevents treating a guess as a target. */
 uncertainty?:number;
}
type RankContext=BidContext & {seat?:number;publicWords?:ReadonlyArray<{seat:number;word:string;reward:number;round?:number}>};
export interface RivalForecast {seat:number;banked:number;heldTiles:number;mean:number;sd:number}
const normalCdf=(x:number)=>{const a=Math.abs(x),t=1/(1+.2316419*a),p=1-0.3989422804*Math.exp(-a*a/2)*t*(.31938153+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));return x<0?1-p:p;};
export function forecastPublicRivals(ctx:RankContext,options:RankRolloutOptions={}):RivalForecast[]{
 const paid=(ctx.history??[]).filter(h=>h.paid>0).slice(-24).map(h=>h.paid).sort((a,b)=>a-b);
 const market=paid.length?paid[Math.floor(paid.length*.6)]!:14;
 const playerCount=ctx.players?.length??6,left=Math.max(0,(ctx.roundsRemaining??10)-2),ppt=options.pointsPerTile??4.8;
 return(ctx.players??[]).flatMap((p,index)=>{
  const seat=p.seat??index;if(seat===ctx.seat)return[];
  const won=(ctx.history??[]).filter(h=>h.winner===seat).length;
  const consumed=ctx.publicWords?ctx.publicWords.filter(w=>w.seat===seat).reduce((n,w)=>n+w.word.length,0):Math.round(p.score/ppt);
  const held=Math.max(0,5+won-consumed);
  // Few auctions remain. Cash merely bounds near-term acquisition ability;
  // this is a distributional estimate, never a known opponent rack value.
  const future=Math.min(left/playerCount,Math.max(0,p.balance)/Math.max(1,market));
  return[{seat,banked:p.score,heldTiles:held,mean:p.score+ppt*(held+future),sd:(options.uncertainty??14)+3*Math.sqrt(held+future)}];
 });
}
export function rankUtility(future:number,ctx:RankContext,rivals:readonly RivalForecast[],options:RankRolloutOptions={}):number{
 const own=ctx.players?.find((p,index)=>(p.seat??index)===ctx.seat)?.score??0;
 const final=own+future;
 const win=rivals.reduce((prob,p)=>prob*normalCdf((final-p.mean)/Math.max(1,p.sd)),1);
 const weight=Math.max(0,Math.min(1,options.winWeight??1));
 // 100 score points and 100 probability percentage points have comparable
 // scale; this mixture is explicit rather than an implicit forecast claim.
 return weight*100*win+(1-weight)*future;
}
export class RankRolloutBidStrategy implements LastTilePolicy {
 readonly bidder:RolloutBidStrategy;lastForecast:RivalForecast[]=[];
 constructor(readonly base:LastTilePolicy,readonly reference:GauchoReference,readonly options:RankRolloutOptions={}){
  this.bidder=new RolloutBidStrategy(base,reference,options,(ref,context,rolloutOptions)=>{
   const ctx=context as RankContext,rivals=forecastPublicRivals(ctx,options);this.lastForecast=rivals;
   if(!rivals.length||ctx.seat===undefined)return null;
   const bundle=createMarketRolloutValuation(ref,ctx,rolloutOptions);if(!bundle)return null;
   return{sampleCount:bundle.sampleCount,horizon:bundle.horizon,reachesFinalPayout:bundle.reachesFinalPayout,evaluatePurchase:cost=>bundle.evaluatePurchase(cost)?.map(future=>rankUtility(future,ctx,rivals,options))??null};
  });
 }
 word(ctx:BidContext):string|null{return this.bidder.word(ctx);}
 bid(ctx:BidContext):number{return this.bidder.bid(ctx);}
 get lastDecision(){return this.bidder.lastDecision;}
}
