/** Auction-specific planning. All inputs are our rack or public match data. */
import { LETTER_VALUE, WordEngine, type NearWordCandidate, type WordCandidate } from './engine.js';
export { LETTER_VALUE } from './engine.js';
const DISTRIBUTION: Record<string,number> = {A:9,B:2,C:2,D:4,E:12,F:2,G:3,H:2,I:9,J:1,K:1,L:4,M:2,N:6,O:8,P:2,Q:1,R:6,S:4,T:6,U:4,V:2,W:2,X:1,Y:2,Z:1};
export interface PublicPlayer { seat?:number; name?:string; balance:number; score:number }
export interface PublicAuction { round?:number; letter:string; winner?:number; paid:number }
export interface PlanningContext {
  myRack:Map<string,number>; myBalance?:number; dictionary?:string[];
  roundsRemaining?:number; round?:number; auctionType?:string; letter?:string;
  players?:ReadonlyArray<PublicPlayer>; history?:ReadonlyArray<PublicAuction>;
  initialRack?:ReadonlyMap<string,number>;
}
export interface BidContext extends PlanningContext { letter:string; myBalance:number }
export interface WordContext extends PlanningContext { dictionary:string[] }
export interface StrategyParams {
  bidScale:number; acquisitionShare:number; holdMargin:number;
  minimumBid:number; maximumSpendFraction:number; futureCost:number;
  /** Optional live market calibration; frozen benchmark controls leave it off. */
  marketRebuild?:boolean;
}
export const DEFAULT_PARAMS: StrategyParams = {
  bidScale:2.0, acquisitionShare:0.6, holdMargin:2.5,
  minimumBid:4, maximumSpendFraction:0.7, futureCost:1.2,
};
interface RackAnalysis { near:NearWordCandidate[]; playable:WordCandidate[]; packing:string[]; packingScore:number }
const keyFor=(rack:ReadonlyMap<string,number>) => [...rack].filter(([,n])=>n>0).sort(([a],[b])=>a.localeCompare(b)).map(([c,n])=>c+n).join('');
const tiles=(rack:ReadonlyMap<string,number>) => [...rack.values()].reduce((a,b)=>a+b,0);
function subtract(rack:ReadonlyMap<string,number>,word:string) {
  const next=new Map(rack);
  for(const c of word){ const n=(next.get(c)??0)-1; if(n>0)next.set(c,n);else next.delete(c); }
  return next;
}
function leave(rack:ReadonlyMap<string,number>):number {
  let total=0,vowels=0,n=0;
  for(const[c,count]of rack){
    const value=LETTER_VALUE[c]??0;
    // Generic liquidity is deliberately much smaller than a completed word.
    total+=count*(1.2+value*.65);n+=count;
    if('AEIOU'.includes(c))vowels+=count;
    if(count>2)total-=(count-2)*1.0;
  }
  if(n>2)total-=Math.abs(vowels/n-.4)*n*.65;
  if(rack.has('Q')&&!rack.has('U')&&!rack.has('I'))total-=3;
  return Math.max(0,total);
}
function probabilityAtLeast(lambda:number,k:number):number {
  if(lambda<=0)return 0;
  let term=Math.exp(-lambda),cdf=term;
  for(let i=1;i<k;i++){term*=lambda/i;cdf+=term;}
  return Math.max(0,Math.min(1,1-cdf));
}

export class ChampionStrategy {
  readonly engine:WordEngine;
  readonly params:StrategyParams;
  private readonly cache=new Map<string,RackAnalysis>();
  constructor(dictionary:readonly string[],params:Partial<StrategyParams>={},engine?:WordEngine){
    this.engine=engine??new WordEngine(dictionary);this.params={...DEFAULT_PARAMS,...params};
  }
  private marketPrice(ctx:PlanningContext):number{
    const prices=(ctx.history??[]).filter(a=>a.paid>0&&(LETTER_VALUE[a.letter]??10)<=4).slice(-24).map(a=>a.paid).sort((a,b)=>a-b);
    return prices.length>=4?prices[Math.floor((prices.length-1)*.65)]:0;
  }
  private analyze(rack:ReadonlyMap<string,number>):RackAnalysis{
    const key=keyFor(rack),old=this.cache.get(key);if(old)return old;
    const near=this.engine.nearWords(rack,3),playable=near.filter(w=>w.missingCount===0);
    const packing=this.engine.bestPacking(rack,{timeBudgetMs:8,maxNodes:1200});
    const value={near,playable,packing:packing.words,packingScore:packing.score};
    if(this.cache.size>=160)this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key,value);return value;
  }
  private equity(rack:ReadonlyMap<string,number>,ctx:PlanningContext,analysis=this.analyze(rack)):number{
    const remaining=Math.max(0,(ctx.roundsRemaining??60)-1);
    if(remaining<=0)return analysis.packingScore;
    const base=leave(rack);
    let best=analysis.packingScore;
    const unobserved={...DISTRIBUTION};
    for(const[c,n]of ctx.initialRack??[])unobserved[c]=Math.max(0,(unobserved[c]??0)-n);
    for(const a of ctx.history??[])unobserved[a.letter]=Math.max(0,(unobserved[a.letter]??0)-1);
    if(ctx.letter)unobserved[ctx.letter]=Math.max(0,(unobserved[ctx.letter]??0)-1);
    const pool=Math.max(remaining,Object.values(unobserved).reduce((a,b)=>a+b,0));
    const share=this.params.acquisitionShare;
    for(const w of analysis.near){
      if(w.length<4||w.length-w.missingCount<2)continue;
      let p=1,consumed=0;
      for(const[c,n]of w.missing){
        const available=unobserved[c]??0;
        if(available<n){p=0;break;}
        p*=probabilityAtLeast(available*remaining/pool*share,n);
      }
      if(p<.025)continue;
      for(let i=0;i<26;i++)if(w.counts[i]){
        const c=String.fromCharCode(65+i);
        consumed+=Math.min(w.counts[i],rack.get(c)??0)*(1.2+(LETTER_VALUE[c]??0)*.65);
      }
      const value=w.score*p+Math.max(0,base-consumed)-this.params.futureCost*w.missingCount;
      if(value>best)best=value;
    }
    // Retain a modest option value for unused letters; never value money as score.
    return Math.max(best,base*.7);
  }
  decideBid(ctx:BidContext):number{
    const balance=Math.max(0,Math.floor(ctx.myBalance));
    if(!balance||!LETTER_VALUE[ctx.letter]||(ctx.roundsRemaining??60)<=1)return 0;
    const current=this.analyze(ctx.myRack),next=new Map(ctx.myRack);
    next.set(ctx.letter,(next.get(ctx.letter)??0)+1);
    const added=this.analyze(next);
    const marginal=Math.max(0,this.equity(next,ctx,added)-this.equity(ctx.myRack,ctx,current));
    const completion=Math.max(0,added.packingScore-current.packingScore);
    const n=tiles(ctx.myRack),left=ctx.roundsRemaining??60;
    let value=Math.max(marginal,completion*.92);
    // When we can still build a rack, useful cheap tiles have positive option value.
    const have=ctx.myRack.get(ctx.letter)??0;
    if(left>8&&n<13&&have<3){
      const vowel='AEIOU'.includes(ctx.letter);
      const vowelCount=[...ctx.myRack].reduce((s,[c,k])=>s+('AEIOU'.includes(c)?k:0),0);
      const balanceBoost=vowel&&vowelCount<Math.max(1,n*.3)?1.4:0;
      value=Math.max(value,this.params.minimumBid+balanceBoost+(have===0?.6:0));
    }
    if(n>18&&completion===0)value*=.65;
    let bid=value*this.params.bidScale;
    if(ctx.auctionType==='FirstPrice'){
      // First-price acquisition must retain positive scoring margin.
      const prices=(ctx.history??[]).filter(a=>a.paid>0).slice(-24).map(a=>a.paid).sort((a,b)=>a-b);
      const median=prices.length?prices[Math.floor(prices.length*.65)]:4;
      bid=Math.min(bid*.78,Math.max(2,median+1,marginal*.72));
    }
    if(this.params.marketRebuild&&left>8&&n<=6&&have<2&&balance>=15&&(LETTER_VALUE[ctx.letter]??10)<=4){
      const market=this.marketPrice(ctx);
      const vowels=[...ctx.myRack].reduce((sum,[c,k])=>sum+('AEIOU'.includes(c)?k:0),0);
      const vowel='AEIOU'.includes(ctx.letter);
      const balanced=n<3||(vowel?vowels/n<.65:vowels/n>.15);
      if(market>=6&&balanced){
        // Paid prices are public and lagged, never opponents' live sealed bids.
        // Raise only a starved rack's acquisition floor, bounded to35% cash.
        const target=market+(ctx.auctionType==='FirstPrice'?1:2);
        bid=Math.max(bid,Math.min(balance*.35,target));
      }
    }
    // Replenishing currency is useful; hoarding an unused balance at the finish isn't.
    const cap=left<=6?balance:Math.max(3,balance*this.params.maximumSpendFraction);
    return Math.max(0,Math.min(balance,Math.floor(Math.min(cap,bid))));
  }
  chooseWord(ctx:PlanningContext):string|null{
    const analysis=this.analyze(ctx.myRack);
    if(!analysis.playable.length)return null;
    const left=ctx.roundsRemaining??60;
    if(left<=2)return analysis.packing[0]??analysis.playable[0].word;
    // At max multiplier there is no bonus for waiting to extend this word.
    const seven=analysis.playable.find(w=>w.length>=7);
    if(seven)return analysis.packing[0]??seven.word;
    const before=this.equity(ctx.myRack,ctx,analysis);
    let bestWord:string|null=null,best=-Infinity;
    for(const w of analysis.playable.slice(0,10)){
      const after=subtract(ctx.myRack,w.word);
      // Exact liquidation plus a cheap leave estimate avoids a scan per candidate.
      const score=w.score+leave(after)*.7;
      if(score>best){best=score;bestWord=w.word;}
    }
    const cashNeeded=(ctx.myBalance??100)<Math.max(8,this.params.marketRebuild?this.marketPrice(ctx)*1.4:0);
    const crowded=tiles(ctx.myRack)>=15;
    if(cashNeeded||crowded||left<=5||best>=before-this.params.holdMargin)return bestWord;
    return null;
  }
}
const engines=new WeakMap<readonly string[],WordEngine>();
export function createStrategy(dictionary:readonly string[],params:Partial<StrategyParams>={}):ChampionStrategy{
  let engine=engines.get(dictionary);if(!engine){engine=new WordEngine(dictionary);engines.set(dictionary,engine);}
  return new ChampionStrategy(dictionary,params,engine);
}
let configured:ChampionStrategy|undefined;
export function configureDictionary(dictionary:readonly string[],params:Partial<StrategyParams>={}):ChampionStrategy{
  return configured=createStrategy(dictionary,params);
}
export function decideBid(ctx:BidContext):number{
  if(!configured&&ctx.dictionary)configured=createStrategy(ctx.dictionary);
  if(configured)return configured.decideBid(ctx);
  return Math.min(Math.max(0,Math.floor(ctx.myBalance)),(LETTER_VALUE[ctx.letter]??0)+2);
}
const defaultPlanners=new WeakMap<readonly string[],ChampionStrategy>();
export function chooseWord(ctx:WordContext):string|null{
  let planner=defaultPlanners.get(ctx.dictionary);
  if(!planner){planner=createStrategy(ctx.dictionary);defaultPlanners.set(ctx.dictionary,planner);}
  return planner.chooseWord(ctx);
}
