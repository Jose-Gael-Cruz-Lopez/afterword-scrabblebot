import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GauchoReference } from './adapter.js';
import { RolloutBidStrategy, type RolloutBidFactory } from './rollout-bid.js';
import type { BidContext } from '../strategy.js';
const context=(left=10):BidContext=>({letter:'X',myRack:new Map([['A',1],['T',1]]),myBalance:100,roundsRemaining:left,round:40,auctionType:'SecondPrice'});
const reference=new GauchoReference(['AX','AT','CAT']);
function model(gain:(price:number)=>number):RolloutBidFactory{return()=>({sampleCount:4,horizon:9,reachesFinalPayout:true,evaluatePurchase:p=>Array(4).fill(p===null?10:10+gain(p))});}
test('purchase ceiling accounts for depleted future funding instead of gross tile value',()=>{
 const p=new RolloutBidStrategy({word:()=>null,bid:()=>10},reference,{strength:1,improvementMargin:0},model(price=>20-price));
 const bid=p.bid(context());assert.ok(bid>10&&bid<100);assert.equal(bid,15);
 assert.ok(p.lastDecision!.prices.find(x=>x.price===100)!.meanGain<0);
});
test('negative funded purchase outcomes lower an excessive bid',()=>{
 const p=new RolloutBidStrategy({word:()=>null,bid:()=>30},reference,{strength:1,improvementMargin:0},model(price=>10-price));
 assert.equal(p.bid(context()),0);
});
test('a timeout or truncated cash bootstrap cannot silently change the live bid',()=>{
 const timed:RolloutBidFactory=()=>({sampleCount:4,horizon:9,reachesFinalPayout:true,evaluatePurchase:()=>null});
 const short:RolloutBidFactory=()=>({sampleCount:4,horizon:3,reachesFinalPayout:false,evaluatePurchase:()=>[100,100,100,100]});
 for(const factory of[timed,short]){const p=new RolloutBidStrategy({word:()=>null,bid:()=>13},reference,{},factory);assert.equal(p.bid(context()),13);assert.equal(p.lastDecision?.expired,true);}
});
test('preserves words, exact/denial tail and first-price behavior',()=>{
 let calls=0;const factory:RolloutBidFactory=()=>{calls++;return null;};
 const p=new RolloutBidStrategy({word:()=> 'AT',bid:()=>17},reference,{},factory);
 assert.equal(p.word(context()),'AT');assert.equal(p.bid(context(2)),17);assert.equal(p.bid(context(1)),17);assert.equal(p.bid({...context(),auctionType:'FirstPrice'}),17);assert.equal(calls,0);
});
test('all costs share the same scenario bundle and unchanged caller state',()=>{
 let bundles=0;const seen:Array<number|null>=[];const factory:RolloutBidFactory=(_r,c,o)=>{bundles++;assert.equal(o.maximumSteps,c.roundsRemaining!-1);return{sampleCount:4,horizon:9,reachesFinalPayout:true,evaluatePurchase:price=>{seen.push(price);return[10,10,10,10];}};};
 const p=new RolloutBidStrategy({word:()=>null,bid:()=>9},reference,{},factory),ctx=context(),before=[...ctx.myRack];
 p.bid(ctx);p.bid(ctx);assert.equal(bundles,1);assert.equal(seen[0],null);assert.ok(seen.length>3);assert.deepEqual([...ctx.myRack],before);
});
