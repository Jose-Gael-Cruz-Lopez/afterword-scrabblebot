import {loadDictionary} from '../../bot-starter/src/simulate.ts';
import {GauchoReference} from '../../bot-starter/src/reference-gaucho/adapter.ts';
import {ExactTerminalStrategy,exactTerminalPartition} from '../../bot-starter/src/reference-gaucho/terminal-exact.ts';
import {BAG,rackFromMap,VALUE} from '../../bot-starter/src/reference-gaucho/core/rules.ts';
const words=loadDictionary(),base=new GauchoReference(words,{terminalSafe:true}),exact=new ExactTerminalStrategy(new GauchoReference(words,{terminalSafe:true}));
const bag=Array.from(BAG).flatMap((n,i)=>Array.from({length:n},()=>String.fromCharCode(65+i)));
let seed=0x69fee2; const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function rack(s:string){const r=new Map<string,number>();for(const c of s)r.set(c,(r.get(c)??0)+1);return r;}
function flush(p:any,s:string){const r=rack(s),out:string[]=[];let score=0;for(let n=0;n<40;n++){const w=p.word({myRack:r,myBalance:100,roundsRemaining:1,letter:'A'});if(!w)return{score,words:out};out.push(w);let face=0;for(const c of w){const count=r.get(c)!;if(!count)throw Error('illegal');if(count===1)r.delete(c);else r.set(c,count-1);face+=VALUE[c.charCodeAt(0)-65]!;}score+=Math.floor(face*(w.length<4?1:w.length===4?1.5:w.length===5?2:w.length===6?2.5:3));}throw Error('loop');}
const found=[];let searched=0,timeouts=0,maxMs=0;const start=performance.now();
for(let n=0;n<1200;n++){
 const pool=[...bag],len=8+n%9;let letters='';for(let j=0;j<len;j++){const i=Math.floor(random()*pool.length);letters+=pool.splice(i,1)[0];}
 const decisionStart=performance.now(),proof=exactTerminalPartition(base.dictionary,rackFromMap(rack(letters)),{timeBudgetMs:18,maxNodes:8000});maxMs=Math.max(maxMs,performance.now()-decisionStart);searched++;if(!proof){timeouts++;continue;}
 const old=flush(base,letters);if(proof.score>old.score){const improved=flush(exact,letters);const x={letters,base:old,exact:improved,proof:proof.score};found.push(x);console.log(JSON.stringify(x));if(found.length>=8)break;}
 if(performance.now()-start>25000)break;
}
console.log(JSON.stringify({searched,timeouts,maxMs,elapsedMs:performance.now()-start,found:found.length}));
