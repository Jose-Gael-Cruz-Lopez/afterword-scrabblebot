import { writeFileSync } from 'node:fs';
import { createStrategy, type StrategyParams } from './strategy.js';
import { benchmark, loadDictionary, createStarterBaseline, createScoreGreedyBaseline, createCompletionBaseline, type SimStrategy } from './simulate.js';
const dictionary=loadDictionary();
export function champion(params:Partial<StrategyParams>={}):SimStrategy{
  const planner=createStrategy(dictionary,params);
  let initialRack:Map<string,number>|undefined;
  return {name:'Afterword',bid(ctx){initialRack??=new Map(ctx.myRack);return planner.decideBid({...ctx,initialRack});},word(ctx){initialRack??=new Map(ctx.myRack);return planner.chooseWord({...ctx,initialRack});}};
}
const count=Number(process.env.SEEDS??12),start=Number(process.env.SEED_START??17001);
const params:Partial<StrategyParams>=process.env.PARAMS?JSON.parse(process.env.PARAMS):{};
const report=benchmark([
 ()=>champion(params),()=>createStarterBaseline(),()=>createScoreGreedyBaseline(),()=>createCompletionBaseline(),
],Array.from({length:count},(_,i)=>start+i),{auctionType:process.env.AUCTION_TYPE==='FirstPrice'?'FirstPrice':'SecondPrice'});
console.log(JSON.stringify(report,null,2));
if(process.env.REPORT_PATH)writeFileSync(process.env.REPORT_PATH,JSON.stringify({params,report},null,2)+'\n');
