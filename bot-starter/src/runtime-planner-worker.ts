import { parentPort, workerData } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { createStrategy, type BidContext } from "./strategy.js";

if (!parentPort) throw new Error("The planner must run in a worker thread");
const dictionary = readFileSync(workerData.dictionaryPath, "utf8").split(/\r?\n/)
  .map(w => w.trim().toUpperCase()).filter(w => /^[A-Z]{2,}$/.test(w));
if (!dictionary.length) throw new Error("The official dictionary is empty");
// Build the full index exactly once, before the bot enters a live match.
const planner = createStrategy(dictionary);
parentPort.on("message", ({ id, context }: { id: number; context: BidContext }) => {
  const started = performance.now();
  try {
    const word = planner.chooseWord(context);
    // Cashing out changes both rack and balance. Re-plan its bid from the
    // resulting authoritative transaction rather than submitting a stale bid.
    const bid = word ? null : planner.decideBid(context);
    parentPort!.postMessage({ id, word, bid, elapsedMs: performance.now() - started });
  } catch (error) {
    parentPort!.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
parentPort.postMessage({ ready: true, dictionarySize: dictionary.length });
