import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastPublicRivals,rankUtility} from './rollout-bid-rank.js';
const ctx={myRack:new Map([['A',1]]),myBalance:20,letter:'E',seat:0,roundsRemaining:8,players:[{seat:0,score:30,balance:20},{seat:1,score:25,balance:40},{seat:2,score:35,balance:40}],history:[{round:1,letter:'E',winner:1,paid:14}],publicWords:[{seat:1,word:'ABLE',reward:9},{seat:2,word:'CAR',reward:5}]};
test('forecast uses public won and publicly consumed tile counts',()=>{const r=forecastPublicRivals(ctx);assert.equal(r.length,2);assert.equal(r[0]!.heldTiles,2);assert.equal(r[1]!.heldTiles,2);assert.ok(r.every(p=>p.sd>=14));});
test('win utility is monotone and more sensitive near uncertain winning boundary',()=>{const r=forecastPublicRivals(ctx);const u=(v:number)=>rankUtility(v,ctx,r);assert.ok(u(10)<u(20)&&u(20)<u(30));assert.ok(u(30)-u(20)>u(130)-u(120));assert.ok(u(50)-u(40)>u(-60)-u(-70));});
test('banked own score is additive; explicit score mix retains own payout',()=>{const r=forecastPublicRivals(ctx);assert.ok(rankUtility(20,{...ctx,players:ctx.players.map(p=>p.seat===0?{...p,score:50}:p)},r)>rankUtility(20,ctx,r));assert.equal(rankUtility(17,ctx,r,{winWeight:0}),17);});
test('unobserved opponent consumption is an estimate with broad uncertainty',()=>{const r=forecastPublicRivals({...ctx,publicWords:undefined});assert.ok(r.every(p=>p.heldTiles>=0&&Number.isFinite(p.mean)&&p.sd>14));});
