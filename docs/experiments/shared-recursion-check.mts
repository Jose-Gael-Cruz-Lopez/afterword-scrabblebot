import {writeFileSync} from 'node:fs';
import {loadDictionary,seededRandom} from '../../bot-starter/src/simulate.ts';
import {compileDictionary} from '../../bot-starter/src/reference-gaucho/adapter.ts';
import {exactTerminalPartition} from '../../bot-starter/src/reference-gaucho/terminal-exact.ts';
import {exactTerminalPartition as previous} from './fixtures/terminal-before-score100/terminal-exact.ts';
import {BAG} from '../../bot-starter/src/reference-gaucho/core/rules.ts';
const d=compileDictionary(loadDictionary()),random=seededRandom(3_107_900_617);
const report:any={seed:3_107_900_617,method:'256 demanding random racks of10/12/14/16 tiles sampled from officialbag. Same fullENABLE dictionary,18ms,8000nodes; order alternates. Not representative of actual final rack distribution. A null means the proof did not finish, not that the score was zero.',rows:[]};
for(let i=0;i<256;i++){
 const bag=Array.from(BAG),rack=new Int32Array(26);for(let n=0;n<10+2*(i%4);n++){let t=Math.floor(random()*bag.reduce((a,b)=>a+b,0));for(let l=0;l<26;l++){t-=bag[l]!;if(t<0){rack[l]!++;bag[l]!--;break;}}}
 const outcomes:any[]=[];for(const variant of i%2?[1,0]:[0,1]){const start=performance.now(),result=(variant?exactTerminalPartition:previous)(d,rack,{timeBudgetMs:18,maxNodes:8000});outcomes[variant]={score:result?.score??null,ms:performance.now()-start};}
 if(outcomes[0].score!==null&&outcomes[1].score!==null&&outcomes[0].score!==outcomes[1].score)throw Error('Exact solvers disagree');
 report.rows.push({rack:Array.from(rack),old:outcomes[0],current:outcomes[1]});
}
report.summary={oldCompleted:report.rows.filter(r=>r.old.score!==null).length,currentCompleted:report.rows.filter(r=>r.current.score!==null).length,currentOnly:report.rows.filter(r=>r.old.score===null&&r.current.score!==null).length,oldOnly:report.rows.filter(r=>r.old.score!==null&&r.current.score===null).length,oldMeanMs:report.rows.reduce((a,r)=>a+r.old.ms,0)/256,currentMeanMs:report.rows.reduce((a,r)=>a+r.current.ms,0)/256};
writeFileSync(new URL('./shared-recursion-check-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary,null,2));
