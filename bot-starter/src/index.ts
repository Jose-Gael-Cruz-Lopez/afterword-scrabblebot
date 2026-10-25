/** Afterword: a responsive, restart-safe client for the official ScrabbleBot rules. */
import { DbConnection, type SubscriptionHandle } from "./module_bindings/index.js";
import type { Match, Auction, MatchParticipant } from "./module_bindings/types.js";
import type { Identity } from "spacetimedb";
import type { BidContext } from "./strategy.js";
import { RuntimePlanner } from "./runtime-planner.js";
import { auctionsRemaining, cappedBid, rackKey, reconstructInitialRack } from "./runtime-state.js";
import { credentialQueries, coreQueries, matchQueries } from "./runtime-subscriptions.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.STDB_HOST ?? "https://maincloud.spacetimedb.com";
const DB_NAME = process.env.STDB_DB ?? "scrabblebot";
const BOT_NAME = process.env.BOT_NAME ?? "Afterword";
const BOT_NONCE = process.env.BOT_NONCE;
const TOURNAMENT_ID = process.env.TOURNAMENT_ID ?? "auto";
const TOKEN_PATH = path.join(process.cwd(), `.token-${BOT_NAME.replace(/[^A-Za-z0-9_.-]/g, "_")}`);
const DICTIONARY_PATH = fileURLToPath(new URL("../../spacetimedb/wordlist.txt", import.meta.url));
const log = (message: string) => console.log(`[${new Date().toISOString()}] [${BOT_NAME}] ${message}`);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
function loadToken(): string | undefined {
  try { return fs.readFileSync(TOKEN_PATH, "utf8").trim() || undefined; } catch { return undefined; }
}
function saveToken(token: string) {
  const temporary = `${TOKEN_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, token, { mode: 0o600 });
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, TOKEN_PATH);
  fs.chmodSync(TOKEN_PATH, 0o600);
}

interface MatchWork {
  running: boolean;
  dirty: boolean;
  initialRack?: Map<string, number>;
  lastFingerprint?: string;
  wordSnapshot?: string;
  retryAt: number;
  failures: number;
  bids: Map<bigint, number>;
}
interface Snapshot {
  match: Match;
  auction: Auction;
  participant: MatchParticipant;
  context: BidContext;
  fingerprint: string;
  rackSnapshot: string;
}

class BotSession {
  private ready = false;
  private closed = false;
  private coreRequested = false;
  private coreReady = false;
  private readonly matchSubscriptions = new Map<bigint, { handle?: SubscriptionHandle; ready: boolean }>();
  private botId: bigint | null = null;
  private claiming = false;
  private pendingImmediate?: NodeJS.Immediate;
  private readonly work = new Map<bigint, MatchWork>();
  private readonly activityInFlight = new Set<string>();
  private readonly activityRetryAt = new Map<string, number>();
  private readonly loggedMatches = new Set<bigint>();
  private readonly watchdog: NodeJS.Timeout;
  constructor(private readonly conn: DbConnection, private readonly identity: Identity, private readonly planner: RuntimePlanner) {
    const changed = () => this.schedule();
    // Table callbacks are coalesced to the next event-loop turn, after the
    // *whole* transaction (rack, score, new auction) has entered the cache.
    conn.db.auction.onInsert(changed); conn.db.auction.onUpdate(changed);
    conn.db.myRack.onInsert(changed); conn.db.myRack.onUpdate(changed); conn.db.myRack.onDelete(changed);
    conn.db.matchParticipant.onInsert(changed); conn.db.matchParticipant.onUpdate(changed);
    conn.db.wordPlay.onInsert(changed);
    conn.db.matchState.onInsert(changed);
    conn.db.matchState.onUpdate(changed);
    conn.db.matchState.onDelete(changed);
    conn.db.botCredential.onInsert(changed);
    conn.db.lobby.onInsert(changed); conn.db.lobby.onUpdate(changed);
    conn.db.lobbyMember.onInsert(changed); conn.db.lobbyMember.onDelete(changed);
    conn.db.tournament.onInsert(changed); conn.db.tournament.onUpdate(changed); conn.db.tournament.onDelete(changed);
    conn.db.tournamentEntry.onInsert(changed); conn.db.tournamentEntry.onUpdate(changed); conn.db.tournamentEntry.onDelete(changed);
    conn.db.auctionResult.onInsert((_ctx, result) => {
      if (this.botId !== null && result.winnerBotId === this.botId) {
        log(`match ${result.matchId}: won '${result.letter}' for ${result.paid}`);
      }
      this.schedule();
    });
    // Resolve only this credential first. Core subscriptions are then scoped
    // to its bot id; large auction/word histories are loaded only for a match
    // we are currently playing and released immediately after its result.
    conn.subscriptionBuilder().onApplied(() => {
      this.ready = true;
      log("credential subscription applied");
      this.schedule();
    }).onError(ctx => this.subscriptionFailed("credential", ctx.event))
      .subscribe(credentialQueries(identity.toHexString()));
    this.watchdog = setInterval(changed, 200);
  }
  close() {
    this.closed = true;
    clearInterval(this.watchdog);
    if (this.pendingImmediate) clearImmediate(this.pendingImmediate);
  }
  schedule() {
    if (this.closed || !this.ready || this.pendingImmediate) return;
    this.pendingImmediate = setImmediate(() => {
      this.pendingImmediate = undefined;
      try { this.pump(); } catch (error) { log(`state update failed: ${errorMessage(error)}`); }
    });
  }
  private pump() {
    if (this.closed) return;
    if (this.botId === null) {
      this.botId = this.conn.db.botCredential.identity.find(this.identity)?.botId ?? null;
      if (this.botId === null) {
        if (BOT_NONCE && !this.claiming) {
          this.claiming = true;
          log("claiming bot credential");
          void this.conn.reducers.claimCredential({ code: BOT_NONCE }).then(() => this.schedule()).catch(error => {
            log(`credential claim failed: ${errorMessage(error)}; supply a fresh nonce or bot token`);
            void shutdown(1);
          });
        } else if (!BOT_NONCE) {
          log("no bot credential for this token; set BOT_TOKEN or BOT_NONCE");
          void shutdown(1);
        }
        return;
      }
      log(`acting as '${this.conn.db.bot.id.find(this.botId)?.name ?? BOT_NAME}' (id ${this.botId})`);
    }
    if (!this.coreRequested) {
      this.coreRequested = true;
      this.conn.subscriptionBuilder().onApplied(() => {
        this.coreReady = true;
        log("bounded core subscription applied; resuming authoritative game state");
        onHealthyConnection();
        this.schedule();
      }).onError(ctx => this.subscriptionFailed("core", ctx.event))
        .subscribe(coreQueries(this.botId));
      return;
    }
    if (!this.coreReady) return;
    this.manageActivity();
    const active = new Set<bigint>();
    for (const p of this.conn.db.matchParticipant.iter()) {
      if (p.botId !== this.botId) continue;
      const match = this.conn.db.matchState.id.find(p.matchId);
      if (match?.status.tag !== "Running") continue;
      active.add(match.id);
      let subscription = this.matchSubscriptions.get(match.id);
      if (!subscription) {
        subscription = { ready: false };
        this.matchSubscriptions.set(match.id, subscription);
        const state = subscription;
        state.handle = this.conn.subscriptionBuilder().onApplied(() => {
          state.ready = true;
          log(`match ${match.id}: scoped live data applied`);
          this.schedule();
        }).onError(ctx => this.subscriptionFailed(`match ${match.id}`, ctx.event))
          .subscribe(matchQueries(match.id, this.botId));
      }
      if (!subscription.ready) continue;
      let work = this.work.get(match.id);
      if (!work) {
        work = { running: false, dirty: false, retryAt: 0, failures: 0, bids: new Map() };
        this.work.set(match.id, work);
        log(`match ${match.id}: running ${match.auctionType.tag}, round ${match.currentRound}`);
      }
      if (work.running) { work.dirty = true; continue; }
      if (Date.now() < work.retryAt) continue;
      void this.processMatch(match.id, work).catch(error => {
        log(`match ${match.id}: planning failed: ${errorMessage(error)}`);
        work!.retryAt = Date.now() + 500;
      });
    }
    for (const [id, state] of this.matchSubscriptions) {
      if (active.has(id) || !state.ready) continue;
      // Capture the final shared scores before unsubscribing removes opponents
      // and history from the SDK cache. Own membership remains in core data.
      if (this.conn.db.matchState.id.find(id)?.status.tag === "Ended") this.logMatchResult(id);
      this.matchSubscriptions.delete(id);
      try { state.handle?.unsubscribe(); }
      catch (error) { log(`match ${id}: unsubscribe failed: ${errorMessage(error)}`); }
      log(`match ${id}: released scoped history`);
    }
    for (const [id, work] of this.work) if (!active.has(id) && !work.running) this.work.delete(id);
  }
  private subscriptionFailed(scope: string, error: unknown) {
    log(`${scope} subscription failed: ${errorMessage(error)}`);
    this.close();
    scheduleReconnect();
  }
  private snapshot(matchId: bigint, work: MatchWork): Snapshot | undefined {
    if (this.closed || this.botId === null || !this.matchSubscriptions.get(matchId)?.ready) return;
    const match = this.conn.db.matchState.id.find(matchId);
    if (!match || match.status.tag !== "Running" || match.currentAuctionId === undefined) return;
    const auction = this.conn.db.auction.id.find(match.currentAuctionId);
    if (!auction || auction.status.tag !== "Open") return;
    const participants = [...this.conn.db.matchParticipant.iter()].filter(p => p.matchId === matchId).sort((a, b) => a.botId < b.botId ? -1 : 1);
    const participant = participants.find(p => p.botId === this.botId);
    if (!participant) return;
    const rack = new Map<string, number>();
    for (const row of this.conn.db.myRack.iter()) if (row.matchId === matchId) rack.set(row.letter, (rack.get(row.letter) ?? 0) + row.count);
    const results = [...this.conn.db.auctionResult.iter()].filter(r => r.matchId === matchId).sort((a, b) => a.auctionId < b.auctionId ? -1 : 1);
    const myWords = [...this.conn.db.wordPlay.iter()].filter(w => w.matchId === matchId && w.botId === this.botId);
    work.initialRack ??= reconstructInitialRack(rack, myWords.map(w => w.word), results.filter(r => r.winnerBotId === this.botId).map(r => r.letter), match.startingRackSize);
    const context: BidContext = {
      matchId: String(matchId), myRack: rack, myBalance: Number(participant.balance), letter: auction.letter,
      initialRack: work.initialRack, round: match.currentRound,
      roundsRemaining: auctionsRemaining(match.startingRackSize, participants.length, match.currentRound),
      auctionType: match.auctionType.tag,
      players: participants.map((p, seat) => ({ seat, name: this.conn.db.bot.id.find(p.botId)?.name, balance: Number(p.balance), score: Number(p.score) })),
      history: results.map((r, i) => ({ round: i + 1, letter: r.letter, paid: Number(r.paid), winner: participants.findIndex(p => p.botId === r.winnerBotId) })),
    };
    const rackSnapshot = `${rackKey(rack)}:${myWords.length}`;
    const fingerprint = `${auction.id}:${rackSnapshot}:${participant.balance}:${participants.map(p => `${p.botId}/${p.balance}/${p.score}`).join(",")}:${results.length}`;
    return { match, auction, participant, context, fingerprint, rackSnapshot };
  }
  private async processMatch(matchId: bigint, work: MatchWork) {
    work.running = true;
    work.dirty = false;
    try {
      const snapshot = this.snapshot(matchId, work);
      if (!snapshot || snapshot.fingerprint === work.lastFingerprint) return;
      const { word, bid, elapsedMs } = await this.planner.plan(snapshot.context);
      const fresh = this.snapshot(matchId, work);
      if (!fresh || fresh.fingerprint !== snapshot.fingerprint) { work.dirty = true; return; }
      if (Date.now() >= Number(fresh.auction.closesAt.microsSinceUnixEpoch / 1000n)) return;
      if (word) {
        if (work.wordSnapshot === snapshot.rackSnapshot) return;
        // One reducer at a time per match; success is deduplicated until the
        // authoritative rack changes. A failure is retried, never cached as done.
        work.wordSnapshot = snapshot.rackSnapshot;
        try {
          await this.conn.reducers.submitWord({ matchId, word });
          log(`match ${matchId}: played '${word}' (computed ${elapsedMs.toFixed(1)}ms, ${snapshot.context.roundsRemaining} auctions left)`);
          work.failures = 0;
          work.retryAt = 0;
          work.dirty = true;
        } catch (error) {
          work.wordSnapshot = undefined;
          this.retry(work, `word '${word}' in match ${matchId}`, error);
        }
        return;
      }
      const amount = cappedBid(bid ?? 0, Number(fresh.participant.balance));
      const previous = work.bids.get(fresh.auction.id);
      // A zero replacement withdraws a no-longer-useful prior bid after a word
      // changed the rack. An initial zero doesn't need a network round trip.
      if (previous !== amount && (amount > 0 || previous !== undefined)) {
        try {
          await this.conn.reducers.submitBid({ auctionId: fresh.auction.id, amount: BigInt(amount) });
          work.bids.set(fresh.auction.id, amount);
          work.failures = 0;
          work.retryAt = 0;
          log(`match ${matchId}: bid ${amount} on '${fresh.auction.letter}' (computed ${elapsedMs.toFixed(1)}ms, ${fresh.context.roundsRemaining} auctions left)`);
        } catch (error) { this.retry(work, `bid in match ${matchId}`, error); return; }
      }
      work.lastFingerprint = snapshot.fingerprint;
    } finally {
      work.running = false;
      if (work.dirty) this.schedule();
    }
  }
  private retry(work: MatchWork, action: string, error: unknown) {
    const wait = Math.min(1000, 25 * 2 ** Math.min(6, work.failures++));
    work.retryAt = Date.now() + wait;
    log(`${action} failed (${errorMessage(error)}); refreshing state before retry`);
  }
  private activity(key: string, action: () => Promise<void>, success: string) {
    if (this.activityInFlight.has(key) || Date.now() < (this.activityRetryAt.get(key) ?? 0)) return;
    this.activityInFlight.add(key);
    void action().then(() => { log(success); this.activityRetryAt.set(key, Date.now() + 1000); }).catch(error => {
      log(`${key} failed: ${errorMessage(error)}`);
      this.activityRetryAt.set(key, Date.now() + 5000);
    }).finally(() => { this.activityInFlight.delete(key); this.schedule(); });
  }
  private manageActivity() {
    const entries = [...this.conn.db.tournamentEntry.iter()].filter(e => e.botId === this.botId);
    const tournaments = [...this.conn.db.tournament.iter()];
    let waitingForTournament = false;
    for (const t of tournaments) {
      const entry = entries.find(e => e.tournamentId === t.id);
      const desired = TOURNAMENT_ID === "auto" || TOURNAMENT_ID === String(t.id);
      if (t.status.tag === "Registration" && desired && !entry) {
        waitingForTournament = true;
        this.activity(`register tournament ${t.id}`, () => this.conn.reducers.registerForTournament({ tournamentId: t.id }), `registered for tournament ${t.id}; staying free for its start`);
      }
      if (entry && !entry.eliminated && ["Registration", "Swiss", "Bracket", "Final"].includes(t.status.tag)) waitingForTournament = true;
    }
    if (waitingForTournament) return;
    const inRunning = [...this.conn.db.matchParticipant.iter()].some(p => p.botId === this.botId && this.conn.db.matchState.id.find(p.matchId)?.status.tag === "Running");
    if (inRunning) return;
    const alreadyQueued = [...this.conn.db.lobbyMember.iter()].some(lm => lm.botId === this.botId && this.conn.db.lobby.id.find(lm.lobbyId)?.status.tag === "Open");
    if (!alreadyQueued) this.activity("join lobby", () => this.conn.reducers.joinLobby({}), "joined casual lobby");
  }
  private logMatchResult(matchId: bigint) {
    if (this.loggedMatches.has(matchId) || this.botId === null) return;
    const players = [...this.conn.db.matchParticipant.iter()].filter(p => p.matchId === matchId).sort((a, b) => Number(b.score - a.score));
    const own = players.find(p => p.botId === this.botId);
    if (!own) return;
    this.loggedMatches.add(matchId);
    const rank = 1 + players.filter(p => p.score > own.score).length;
    log(`match ${matchId} ended: rank ${rank}/${players.length}, score ${own.score}, balance ${own.balance}; ${players.map(p => `${this.conn.db.bot.id.find(p.botId)?.name ?? p.botId}=${p.score}`).join(", ")}`);
  }
}

let planner: RuntimePlanner;
let activeConnection: DbConnection | undefined;
let activeSession: BotSession | undefined;
let stopping = false;
let reconnectTimer: NodeJS.Timeout | undefined;
let reconnectAttempt = 0;
let connectionEpoch = 0;
function onHealthyConnection() { reconnectAttempt = 0; }
function scheduleReconnect() {
  if (stopping || reconnectTimer) return;
  const delay = Math.min(30_000, 500 * 2 ** Math.min(6, reconnectAttempt++));
  // Install the guard before disconnect(): SDK disconnect callbacks can be
  // synchronous, and must not recursively schedule another reconnect.
  reconnectTimer = setTimeout(() => { reconnectTimer = undefined; connect(); }, delay);
  activeSession?.close();
  activeConnection?.disconnect();
  log(`reconnecting in ${delay}ms`);
}
function connect() {
  if (stopping) return;
  const epoch = ++connectionEpoch;
  log(`connecting to ${DB_NAME} at ${HOST}`);
  try {
    activeConnection = DbConnection.builder().withUri(HOST).withDatabaseName(DB_NAME)
      .withToken(process.env.BOT_TOKEN ?? loadToken())
      .onConnect((conn, identity, token) => {
        if (stopping || epoch !== connectionEpoch) { conn.disconnect(); return; }
        try { saveToken(token); }
        catch (error) { log(`could not persist credential: ${errorMessage(error)}`); }
        activeSession = new BotSession(conn, identity, planner);
      })
      .onConnectError((_ctx, error) => {
        if (epoch !== connectionEpoch || stopping) return;
        log(`connect failed: ${errorMessage(error)}`);
        scheduleReconnect();
      })
      .onDisconnect((_ctx, error) => {
        if (epoch !== connectionEpoch || stopping) return;
        activeSession?.close();
        log(`disconnected${error ? `: ${errorMessage(error)}` : ""}`);
        scheduleReconnect();
      }).build();
  } catch (error) { log(`connect failed: ${errorMessage(error)}`); scheduleReconnect(); }
}
async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  activeSession?.close();
  activeConnection?.disconnect();
  await planner?.stop();
  log("stopped cleanly");
}
process.once("SIGTERM", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown(); });
process.on("unhandledRejection", error => log(`unexpected async rejection: ${errorMessage(error)}`));
async function main() {
  if (TOURNAMENT_ID !== "auto" && TOURNAMENT_ID !== "none" && !/^\d+$/.test(TOURNAMENT_ID)) throw new Error("TOURNAMENT_ID must be auto, none, or a numeric id");
  if (!fs.existsSync(DICTIONARY_PATH)) throw new Error(`Missing official dictionary: ${DICTIONARY_PATH}`);
  planner = new RuntimePlanner(DICTIONARY_PATH);
  log(`indexed ${await planner.ready} official words in the planner worker; policy=${process.env.BOT_POLICY ?? "licensed"}; terminalSafe=${process.env.BOT_POLICY !== "original"}`);
  connect();
}
void main().catch(async error => { log(`startup failed: ${errorMessage(error)}`); await shutdown(1); });
