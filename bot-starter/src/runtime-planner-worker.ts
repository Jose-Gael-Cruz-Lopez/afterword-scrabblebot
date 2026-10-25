import { parentPort, workerData } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { createStrategy, type BidContext } from "./strategy.js";
import { createGauchoStrategy } from "./reference-gaucho/adapter.js";
import { ExactTerminalStrategy } from "./reference-gaucho/terminal-exact.js";
import { LastTileDenial, type LastTilePolicy } from "./last-tile-denial.js";

if (!parentPort) throw new Error("The planner must run in a worker thread");
const dictionary = readFileSync(workerData.dictionaryPath, "utf8").split(/\r?\n/)
  .map(w => w.trim().toUpperCase()).filter(w => /^[A-Z]{2,}$/.test(w));
if (!dictionary.length) throw new Error("The official dictionary is empty");
// Build the full index exactly once, before the bot enters a live match.
// The strongest tested candidate is the attributed MIT-licensed Gaucho policy.
// Original Afterword and experimental market policy remain explicit opt-ins.
const policy = process.env.BOT_POLICY ?? "licensed";
if(!["licensed","original"].includes(policy))throw new Error("BOT_POLICY must be licensed or original");
const original = policy === "original" ? createStrategy(dictionary, { marketRebuild: process.env.MARKET_REBUILD === "1" }) : undefined;
const matches = new Map<string,LastTilePolicy>();
// Compile the shared dictionary before connecting, outside auction latency.
createGauchoStrategy(dictionary);
function reference(ctx:BidContext):LastTilePolicy{
  const key=ctx.matchId??"test";
  let planner=matches.get(key);
  if(!planner){
    planner = new LastTileDenial(new ExactTerminalStrategy(
      createGauchoStrategy(dictionary, { name: "Afterword", terminalSafe: true }),
      { timeBudgetMs: 18, maxNodes: 8000 },
    ));
    if(matches.size>=16)matches.delete(matches.keys().next().value!);
    matches.set(key,planner);
  }
  return planner;
}
parentPort.on("message", ({ id, context }: { id: number; context: BidContext }) => {
  const started = performance.now();
  try {
    const word = original ? original.chooseWord(context) : reference(context).word(context);
    // Cashing out changes both rack and balance. Re-plan its bid from the
    // resulting authoritative transaction rather than submitting a stale bid.
    const bid = word ? null : original ? original.decideBid(context) : reference(context).bid(context);
    parentPort!.postMessage({ id, word, bid, elapsedMs: performance.now() - started });
  } catch (error) {
    parentPort!.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
parentPort.postMessage({ ready: true, dictionarySize: dictionary.length });
