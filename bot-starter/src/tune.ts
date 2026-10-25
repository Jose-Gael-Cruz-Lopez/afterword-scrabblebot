/** Offline-only, seat-balanced self-play tuning. No live bot is changed. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createStrategy, DEFAULT_PARAMS, type StrategyParams } from './strategy.js';
import { benchmark, createCompletionBaseline, loadDictionary, type SimStrategy, type SimAuctionType } from './simulate.js';

interface Variant { name:string; params:Partial<StrategyParams>; baseline?:'completion' }
const dictionary=loadDictionary();
// Freeze the pre-tuning control so changing the production defaults does not
// silently change what a later rerun means by "default".
const controlParams:StrategyParams={
  bidScale:1.15,acquisitionShare:0.6,holdMargin:2.5,
  minimumBid:2,maximumSpendFraction:0.5,futureCost:1.2,
};
function champion(variant:Variant):SimStrategy {
  if(variant.baseline==='completion')return createCompletionBaseline(variant.name);
  const planner=createStrategy(dictionary,{...controlParams,...variant.params});
  let initialRack:Map<string,number>|undefined;
  return {
    name:variant.name,
    bid(ctx){initialRack??=new Map(ctx.myRack);return planner.decideBid({...ctx,initialRack});},
    word(ctx){initialRack??=new Map(ctx.myRack);return planner.chooseWord({...ctx,initialRack});},
  };
}

const stage=process.env.TUNE_STAGE??'isolated';
const variants:Variant[]=process.env.VARIANTS?JSON.parse(process.env.VARIANTS):stage==='isolated'?[
  {name:'default',params:{}},
  {name:'bid-1.6',params:{bidScale:1.6}},
  {name:'bid-2.0',params:{bidScale:2.0}},
  {name:'acquisition-0.8',params:{acquisitionShare:0.8}},
  {name:'hold-0',params:{holdMargin:0}},
  {name:'hold-4',params:{holdMargin:4}},
]:[
  {name:'default',params:{}},
  {name:'bid-1.6',params:{bidScale:1.6}},
  {name:'bid-2.0',params:{bidScale:2.0}},
  {name:'buy-more',params:{bidScale:1.6,acquisitionShare:0.8,maximumSpendFraction:0.7,minimumBid:3}},
  {name:'fast-cash',params:{bidScale:1.6,holdMargin:4,minimumBid:4}},
  {name:'completion',params:{},baseline:'completion'},
];
const count=Number(process.env.SEEDS??10),start=Number(process.env.SEED_START??28001);
const auctionType:SimAuctionType=process.env.AUCTION_TYPE==='FirstPrice'?'FirstPrice':'SecondPrice';
const report=benchmark(variants.map(v=>()=>champion(v)),Array.from({length:count},(_,i)=>start+i),{auctionType});
const run={stage,auctionType,seeds:{start,count},defaultParams:{...controlParams},productionParams:{...DEFAULT_PARAMS},variants,report};
console.log(JSON.stringify(run,null,2));
const reportPath=fileURLToPath(new URL('../../docs/benchmark-tuning.json',import.meta.url));
let archive:{runs:unknown[]};
try{archive=JSON.parse(readFileSync(reportPath,'utf8'));}catch{archive={runs:[]};}
archive.runs.push(run);
mkdirSync(fileURLToPath(new URL('../../docs/',import.meta.url)),{recursive:true});
writeFileSync(reportPath,JSON.stringify(archive,null,2)+'\n');
