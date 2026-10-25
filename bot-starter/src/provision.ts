/** Provision a competition-only token using the user's existing official CLI sign-in.
 * No token or nonce is ever logged or committed. This never starts a match. */
import { readFileSync,writeFileSync,chmodSync,existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { DbConnection,tables } from './module_bindings/index.js';
const HOST='https://maincloud.spacetimedb.com',DB='scrabblebot';
const file=resolve(process.cwd(),`.token-${process.env.BOT_NAME??'Afterword'}`);
const config=readFileSync(process.env.SCRABBLE_CLI_CONFIG??resolve(homedir(),'.config/scrabblebot-cli/config/cli.toml'),'utf8');
const auth=config.match(/^spacetimedb_token\s*=\s*"([^"]+)"/m)?.[1];
if(!auth)throw new Error('Complete official CLI sign-in first.');
if(existsSync(file))throw new Error('A token already exists; refusing to replace it.');
function connect(token?:string):Promise<DbConnection>{return new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(new Error('Connection timed out')),15000);
 DbConnection.builder().withUri(HOST).withDatabaseName(DB).withToken(token)
 .onConnect((c)=>{clearTimeout(timer);resolve(c);}).onConnectError((_c,e)=>{clearTimeout(timer);reject(e);}).build();
});}
function subscribe(c:DbConnection,queries:any[]):Promise<void>{return new Promise((resolve,reject)=>{
 c.subscriptionBuilder().onApplied(()=>resolve()).onError(ctx=>reject(new Error(String(ctx.event)))).subscribe(queries);
});}
async function wait<T>(f:()=>T|null|undefined):Promise<T>{for(let i=0;i<100;i++){const v=f();if(v!=null)return v;await new Promise(r=>setTimeout(r,50));}throw new Error('Provision state did not arrive.');}
const human=await connect(auth);
try{
 await subscribe(human,[tables.myTeam,tables.myNonces]);
 const team=[...human.db.myTeam.iter()][0];
 if(!team)throw new Error('No team for signed-in user.');
 const previous=new Set([...human.db.myNonces.iter()].map(n=>n.code));
 await human.reducers.mintCredentialNonce({});
 const nonce=await wait(()=>[...human.db.myNonces.iter()].find(n=>n.botId===team.botId&&!previous.has(n.code)));
 const bot=await connect();
 try{
  await subscribe(bot,[tables.botCredential,tables.bot]);
  await bot.reducers.claimCredential({code:nonce.code});
  const credential=await wait(()=>bot.db.botCredential.identity.find(bot.identity!));
  if(credential.botId!==team.botId)throw new Error('Credential bot mismatch.');
  const token=bot.token;
  if(!token)throw new Error('Connection token unavailable.');
  writeFileSync(file,token,{mode:0o600,flag:'wx'});chmodSync(file,0o600);
  console.log(`Provisioned token for ${team.botName} (bot #${team.botId}); saved privately to ${file}.`);
 }finally{bot.disconnect();}
}finally{human.disconnect();}
