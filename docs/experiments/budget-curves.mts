/** Independent budget-curve experiment; offline only, no production imports.
 * VARIANT=cold6|open-floor|sqrt bot-starter/node_modules/.bin/tsx docs/experiments/budget-curves.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ChampionStrategy, type StrategyParams } from './fixtures/budget-curve-core/bot-starter/src/strategy.ts';
import { WordEngine, LETTER_VALUE } from './fixtures/budget-curve-core/bot-starter/src/engine.ts';
import { loadDictionary, runMatch, type SimContext, type SimStrategy } from './fixtures/budget-curve-core/bot-starter/src/simulate.ts';

const dictionary=loadDictionary(), engine=new WordEngine(dictionary);
const params:StrategyParams={bidScale:2,minimumBid:4,maximumSpendFraction:.7,acquisitionShare:.6,holdMargin:2.5,futureCost:1.2,marketRebuild:false};
const variant=process.env.VARIANT??'cold6';
if(!['cold6','open-floor','sqrt'].includes(variant))throw new Error('Unknown VARIANT');
const count=Number(process.env.SEEDS??24), seedStart=Number(process.env.SEED_START??8130071);
const rackSize=(ctx:SimContext)=>[...ctx.myRack.values()].reduce((n,k)=>n+k,0);
function adjusted(base:number,ctx:SimContext):number{
  if(ctx.roundsRemaining<=2)return base;
  const balance=ctx.myBalance, left=ctx.roundsRemaining;
  if(variant==='sqrt')return Math.min(balance,Math.max(0,Math.floor(base*Math.min(3,Math.max(.6,Math.sqrt(balance/(left+1)/3))))));
  const n=rackSize(ctx),have=ctx.myRack.get(ctx.letter)??0;
  const vowels=[...ctx.myRack].reduce((sum,[c,k])=>sum+('AEIOU'.includes(c)?k:0),0);
  const vowel='AEIOU'.includes(ctx.letter);
  const balanced=n<3||(vowel?vowels/n<.65:vowels/n>.15);
  // The floor is derived from our cash and remaining purchase opportunities,
  // never from opponents' bids/prices. It applies only to usable material.
  if((variant==='cold6'&&n>6)||have>=2||!balanced||(LETTER_VALUE[ctx.letter]??10)>4)return base;
  const target=balance/(left/Math.max(ctx.players.length,2))+3;
  const floor=Math.min(balance*.35,target);
  return Math.max(base,Math.min(balance,Math.max(0,Math.floor(floor))));
}
function champion(adapt:boolean):SimStrategy{
  const planner=new ChampionStrategy(dictionary,params,engine);let initialRack:Map<string,number>|undefined;
  return {name:adapt?`budget-${variant}`:'control',
    word(ctx){initialRack??=new Map(ctx.myRack);return planner.chooseWord({...ctx,initialRack});},
    bid(ctx){initialRack??=new Map(ctx.myRack);const base=planner.decideBid({...ctx,initialRack});return adapt?adjusted(base,ctx):base;},
  };
}
function pressure(floor:number):SimStrategy{
  return {name:`pressure-${floor}`,
    word(ctx){
      const words=engine.playable(ctx.myRack);if(!words.length)return null;
      if(ctx.roundsRemaining<=2)return engine.bestPacking(ctx.myRack,{timeBudgetMs:4,maxNodes:500}).words[0]??words[0].word;
      if(ctx.roundsRemaining<=6||ctx.myBalance<floor||rackSize(ctx)>=15)return words[0].word;
      return words.find(w=>w.length>=7)?.word??null;
    },
    bid(ctx){
      if(ctx.roundsRemaining<=1||ctx.myBalance<1)return 0;
      const before=engine.playable(ctx.myRack)[0]?.score??0;
      const next=new Map(ctx.myRack);next.set(ctx.letter,(next.get(ctx.letter)??0)+1);
      const gain=(engine.playable(next)[0]?.score??0)-before;
      return Math.min(Math.floor(ctx.myBalance),Math.max(floor,Math.floor(gain*1.1)));
    },
  };
}
function patient():SimStrategy{
  let key='',near:ReturnType<WordEngine['nearWords']>=[];
  return {name:'patient-seven',
    word(ctx){
      const words=engine.playable(ctx.myRack);if(!words.length)return null;
      if(ctx.roundsRemaining<=2)return engine.bestPacking(ctx.myRack,{timeBudgetMs:4,maxNodes:500}).words[0]??words[0].word;
      if(ctx.myBalance<10||ctx.roundsRemaining<=6||rackSize(ctx)>=15)return words[0].word;
      return words.find(w=>w.length>=7)?.word??null;
    },
    bid(ctx){
      if(ctx.roundsRemaining<=1)return 0;
      const nextKey=[...ctx.myRack].sort().map(([c,n])=>c+n).join('');
      if(nextKey!==key){key=nextKey;near=engine.nearWords(ctx.myRack,2);}
      const before=engine.playable(ctx.myRack)[0]?.score??0;
      let value=1+(LETTER_VALUE[ctx.letter]??1)*.8;
      for(const word of near){
        if(!(word.missing.get(ctx.letter)??0))continue;
        if(word.missingCount===1)value=Math.max(value,(word.score-before)*1.25);
        else if(word.length>=7)value=Math.max(value,word.score*.12);
      }
      const vowels=[...ctx.myRack].reduce((sum,[c,k])=>sum+('AEIOU'.includes(c)?k:0),0);
      if(vowels<2&&'AEIOU'.includes(ctx.letter))value=Math.max(value,5);
      return Math.min(ctx.myBalance,Math.floor(ctx.myBalance*.5),Math.max(0,Math.floor(value*(ctx.auctionType==='FirstPrice'?.8:1))));
    },
  };
}
const factories=[()=>champion(false),()=>champion(true),()=>pressure(14),()=>pressure(16),()=>pressure(18),()=>patient()];
const report:any={variant,params,sourceManifest:JSON.parse(readFileSync(new URL('./fixtures/budget-curve-core/manifest.json',import.meta.url),'utf8')),
  seeds:{start:seedStart,count,stride:7919},methodology:'Each seed runs both auction modes with the same bag and a rotating six-player roster. At 24 seeds each policy occupies each seat four times per mode. Fresh strategy state each match. No network or private opponent state.',
  matches:0,errors:[],matchesDetail:[],rows:factories.map(make=>({name:make().name,matches:0,wins:0,score:0,balance:0,spent:0,tilesWon:0,place:0,maxDecisionMs:0,seats:Array(6).fill(0),byMode:Object.fromEntries(['SecondPrice','FirstPrice'].map(mode=>[mode,{matches:0,wins:0,score:0,balance:0,spent:0,tilesWon:0,place:0,seats:Array(6).fill(0)}]))})),startedAt:new Date().toISOString()};
const output=new URL(`./budget-${variant}-report.json`,import.meta.url);
const start=performance.now();
for(let n=0;n<count;n++)for(let mode=0;mode<2;mode++){
  const seed=seedStart+n*7919,auctionType=mode?'FirstPrice':'SecondPrice';
  const rotation=(n*5+mode)%6,roster=factories.map((_,seat)=>(seat+rotation)%6);
  const result=runMatch(roster.map(i=>factories[i]()),seed,{dictionary,auctionType});
  const top=Math.max(...result.players.map(p=>p.score)),ties=result.players.filter(p=>p.score===top).length;
  report.matches++;report.errors.push(...result.errors);
  report.matchesDetail.push({seed,auctionType,players:result.players.map(p=>({name:p.name,seat:p.seat,score:p.score,balance:p.balance,spent:p.spent,tilesWon:p.tilesWon}))});
  result.players.forEach((p,seat)=>{
    const row=report.rows[roster[seat]],bucket=row.byMode[auctionType];
    const win=p.score===top?1/ties:0;
    const place=1+result.players.filter(q=>q.score>p.score).length+(result.players.filter(q=>q.score===p.score).length-1)/2;
    for(const target of[row,bucket]){target.matches++;target.wins+=win;target.score+=p.score;target.balance+=p.balance;target.spent+=p.spent;target.tilesWon+=p.tilesWon;target.place+=place;target.seats[seat]++;}
    row.maxDecisionMs=Math.max(row.maxDecisionMs,p.maxBidMs,p.maxWordMs);
  });
  report.elapsedMs=performance.now()-start;
  writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({variant,match:report.matches,seed,auctionType,players:result.players.slice(0,2).map(p=>({name:p.name,score:p.score}))}));
}
report.finishedAt=new Date().toISOString();
for(const row of report.rows)for(const target of[row,...Object.values(row.byMode)] as any[]){
  target.winRate=target.wins/target.matches;target.meanScore=target.score/target.matches;target.meanBalance=target.balance/target.matches;target.meanSpent=target.spent/target.matches;target.meanTilesWon=target.tilesWon/target.matches;target.meanPlace=target.place/target.matches;
}
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({variant,matches:report.matches,errors:report.errors,rows:report.rows},null,2));
