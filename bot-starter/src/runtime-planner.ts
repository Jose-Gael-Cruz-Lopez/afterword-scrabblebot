import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { BidContext } from "./strategy.js";

export interface Plan { word: string | null; bid: number | null; elapsedMs: number }
interface Pending {
  resolve: (plan: Plan) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}
/** Keep dictionary search off the WebSocket event loop, including under tsx.
 * A failed/hung search worker is replaced; pending decisions fail and the live
 * client re-reads authoritative state before retrying rather than using old work.
 */
export class RuntimePlanner {
  private worker?: Worker;
  private sequence = 0;
  private generation = 0;
  private failures = 0;
  private pending = new Map<number, Pending>();
  private stopped = false;
  private rejectReady!: (error: Error) => void;
  private readyPromise!: Promise<number>;
  private startupTimer?: NodeJS.Timeout;
  private restartTimer?: NodeJS.Timeout;
  get ready(): Promise<number> { return this.readyPromise; }
  constructor(private readonly dictionaryPath: string) { this.start(); }
  private start(delay = 0) {
    const generation = ++this.generation;
    this.readyPromise = new Promise((resolve, reject) => {
      this.rejectReady = reject;
      const spawn = () => {
        if (this.stopped) { reject(new Error("Planner stopped")); return; }
        try {
          const compiled = new URL("./runtime-planner-worker.js", import.meta.url);
          const source = new URL("./runtime-planner-worker.ts", import.meta.url);
          const workerData = { dictionaryPath: this.dictionaryPath };
          if (existsSync(compiled)) {
            this.worker = new Worker(compiled, { workerData, execArgv: [] });
          } else {
            const loader = createRequire(import.meta.url).resolve("tsx/esm/api");
            // tsImport is the supported tsx API and works for ESM worker entrypoints.
            this.worker = new Worker(
              `require(${JSON.stringify(loader)}).tsImport(${JSON.stringify(source.href)}, ${JSON.stringify(import.meta.url)}).catch(e => { console.error(e); process.exitCode = 1; });`,
              { eval: true, workerData, execArgv: [] },
            );
          }
          this.startupTimer = setTimeout(() => this.fail(new Error("Planner startup timed out"), generation), 15_000);
          this.worker.on("message", message => {
            if (generation !== this.generation || this.stopped) return;
            if (message.ready) {
              clearTimeout(this.startupTimer);
              this.failures = 0;
              resolve(message.dictionarySize);
              return;
            }
            const request = this.pending.get(message.id);
            if (!request) return;
            clearTimeout(request.timer);
            this.pending.delete(message.id);
            if (message.error) request.reject(new Error(message.error));
            else request.resolve(message);
          });
          this.worker.on("error", error => this.fail(error, generation));
          this.worker.on("exit", code => {
            if (!this.stopped) this.fail(new Error(`Planner worker exited unexpectedly (${code})`), generation);
          });
        } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error)), generation); }
      };
      if (delay) this.restartTimer = setTimeout(spawn, delay);
      else spawn();
    });
    // Replacement readiness may reject before a new live request attaches.
    // Keep its rejection handled while preserving the rejection for awaiters.
    void this.readyPromise.catch(() => {});
  }
  private rejectPending(error: Error) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
  private fail(error: Error, generation: number) {
    if (this.stopped || generation !== this.generation) return;
    ++this.generation; // Ignore the old worker's later exit/message callbacks.
    clearTimeout(this.startupTimer);
    this.rejectReady(error);
    this.rejectPending(error);
    void this.worker?.terminate();
    this.worker = undefined;
    this.start(Math.min(10_000, 500 * 2 ** Math.min(5, this.failures++)));
  }
  async plan(context: BidContext): Promise<Plan> {
    // A replacement can begin while a caller awaits startup; only submit to
    // the generation whose readiness it actually observed.
    for (;;) {
      const readiness = this.readyPromise;
      await readiness;
      if (this.stopped) throw new Error("Planner stopped");
      if (readiness === this.readyPromise) break;
    }
    const id = ++this.sequence;
    const generation = this.generation;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error("Planner decision timed out"), generation), 3000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.worker!.postMessage({ id, context }); }
      catch (error) { this.fail(error instanceof Error ? error : new Error(String(error)), generation); }
    });
  }
  async stop() {
    this.stopped = true;
    ++this.generation;
    clearTimeout(this.startupTimer);
    clearTimeout(this.restartTimer);
    this.rejectReady(new Error("Planner stopped"));
    this.rejectPending(new Error("Planner stopped"));
    await this.worker?.terminate();
  }
}
