/** Offline paired win-objective experiment. Does not connect to any service.
 * bot-starter/node_modules/.bin/tsx docs/experiments/last-tile-denial.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GauchoReference } from '../../bot-starter/src/reference-gaucho/adapter.ts';
import type { Params } from '../../bot-starter/src/reference-gaucho/core/policy.ts';
import { LastTileDenial } from '../../bot-starter/src/last-tile-denial.ts';
import { runMatch, loadDictionary, type SimStrategy, type SimContext, type SimAuctionType } from '../../bot-starter/src/simulate.ts';
import { WordEngine } from '../../bot-starter/src/engine.ts';
const dictionary = loadDictionary(), engine = new WordEngine(dictionary);
function licensed(name: string, overrides: Partial<Params> = {}): SimStrategy {
  const base = new GauchoReference(dictionary, { name, overrides, terminalSafe: true });
  return { name, word: c => base.word(c), bid: c => base.bid(c) };
}
function pressure(price: number): SimStrategy {
  return { name: `pressure-${price}`, word(c) {
    const words = engine.playable(c.myRack);
    if (c.roundsRemaining <= 2) return engine.bestPacking(c.myRack, { timeBudgetMs: 4, maxNodes: 500 }).words[0] ?? null;
    return (c.myBalance < price || c.roundsRemaining <= 6 ? words[0] : words.find(w => w.length >= 7))?.word ?? null;
  }, bid(c) {
    if (c.roundsRemaining <= 1) return 0;
    const before = engine.playable(c.myRack)[0]?.score ?? 0, next = new Map(c.myRack);
    next.set(c.letter, (next.get(c.letter) ?? 0) + 1);
    return Math.min(c.myBalance, Math.max(price, Math.floor(((engine.playable(next)[0]?.score ?? 0) - before) * 1.1)));
  } };
}
function patient(): SimStrategy {
  return { name: 'patient-seven', word(c) {
    const words = engine.playable(c.myRack);
    return (c.roundsRemaining <= 2 || c.myBalance < 12 ? words[0] : words.find(w => w.length >= 7))?.word ?? null;
  }, bid: c => c.roundsRemaining <= 1 ? 0 : Math.min(c.myBalance, 14) };
}
const rosters: Array<{ name: string; opponents: Array<() => SimStrategy> }> = [
  { name: 'licensed-clones-and-mutants', opponents: [() => licensed('clone-A'), () => licensed('clone-B'), () => licensed('aggressive', { c0: .7, lowCash: 18 }), () => licensed('liquid', { lowCash: 20, minPlayReward: 32 }), patient] },
  { name: 'licensed-and-pressure', opponents: [() => licensed('clone-A'), () => licensed('aggressive', { c0: .7, lowCash: 18 }), () => pressure(14), () => pressure(16), () => pressure(18)] },
  { name: 'licensed-and-patient', opponents: [() => licensed('clone-A'), () => licensed('long', { minPlayReward: 50, pBase: .92 }), () => licensed('liquid', { lowCash: 20, minPlayReward: 32 }), patient, () => pressure(16)] },
];
interface Scenario { seed: number; mode: SimAuctionType; seat: number; roster: number }
const scenarios: Scenario[] = [];
for (const mode of ['SecondPrice', 'FirstPrice'] as const) for (let n = 0; n < 24; n++) scenarios.push({ seed: 1_137_500_011 + n * 7919 + (mode === 'FirstPrice' ? 1_000_003 : 0), mode, seat: n % 6, roster: n % 3 });
const report: any = { name: 'last-tile-denial', terminalSafe: true, upstreamCommit: 'f2dce03a99e01a88ef9fdf2e300b50ef592c4c50', startedAt: new Date().toISOString(),
  methodology: '48 fresh matched scenario pairs/96games,24 per auctionmode, balanced6seats. Candidate differs only in last usable auction bid: it always invokes inner bid for priming then replaces amount with fullbalance. Current licensed terminalSafe=true control. Three strong licensed clone/mutant and price-pressure/patient rosters. Seed/seat/opponent policies identical for both arms; prefix trace hashed and compared.',
  sourceHashes: Object.fromEntries(['../../bot-starter/src/reference-gaucho/adapter.ts', '../../bot-starter/src/reference-gaucho/core/policy.ts', '../../bot-starter/src/last-tile-denial.ts'].map(file => [file, createHash('sha256').update(readFileSync(new URL(file, import.meta.url))).digest('hex')])),
  rosters: rosters.map(r => r.name), scenarios, pairs: [], errors: [] };
const started = performance.now(), output = new URL('./last-tile-denial-report.json', import.meta.url);
function play(s: Scenario, denial: boolean) {
  const name = denial ? 'last-tile-denial' : 'licensed-control';
  const base = new GauchoReference(dictionary, { name, terminalSafe: true });
  let lastBid: { original: number; actual: number; balance: number; letter: string } | undefined;
  const recordingBase = { word: (c: SimContext) => base.word(c), bid: (c: SimContext) => {
    const amount = base.bid(c); if (c.roundsRemaining === 2) lastBid = { original: amount, actual: amount, balance: c.myBalance, letter: c.letter }; return amount;
  } };
  const wrapped = denial ? new LastTileDenial(recordingBase) : recordingBase;
  const focal: SimStrategy = { name, word: c => wrapped.word(c), bid: c => { const amount = wrapped.bid(c); if (lastBid && c.roundsRemaining === 2) lastBid.actual = amount; return amount; } };
  const players = rosters[s.roster]!.opponents.map(f => f()); players.splice(s.seat, 0, focal);
  const result = runMatch(players, s.seed, { dictionary, auctionType: s.mode, trace: true });
  report.errors.push(...result.errors);
  const own = result.players[s.seat]!, top = Math.max(...result.players.map(p => p.score));
  const lastUsefulRound = result.auctions.length - 1;
  const prefix = result.trace.filter(e => e.round < lastUsefulRound);
  return { score: own.score, win: own.score === top ? 1 / result.players.filter(p => p.score === top).length : 0,
    rank: 1 + result.players.filter(p => p.score > own.score).length, balance: own.balance,
    prefixHash: createHash('sha256').update(JSON.stringify(prefix)).digest('hex'), lastBid,
    wonLastUseful: result.auctions[lastUsefulRound - 1]?.winner === s.seat,
    lastUsefulResult: result.auctions[lastUsefulRound - 1], players: result.players.map(p => ({ name: p.name, seat: p.seat, score: p.score })),
    maxDecisionMs: Math.max(own.maxBidMs, own.maxWordMs), meanDecisionMs: (own.bidMs + own.wordMs) / (own.bidCalls + own.wordCalls),
  };
}
function summary(pairs: any[]) {
  const n = pairs.length, average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const stats = (which: 'control' | 'candidate') => ({ games: n, wins: pairs.reduce((a, p) => a + p[which].win, 0), winRate: average(pairs.map(p => p[which].win)), meanScore: average(pairs.map(p => p[which].score)), meanRank: average(pairs.map(p => p[which].rank)), maxDecisionMs: Math.max(...pairs.map(p => p[which].maxDecisionMs)), meanDecisionMs: average(pairs.map(p => p[which].meanDecisionMs)) });
  const scoreDeltas = pairs.map(p => p.candidate.score - p.control.score), winDeltas = pairs.map(p => p.candidate.win - p.control.win);
  const se = (xs: number[]) => { const m = average(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1) / xs.length); };
  return { control: stats('control'), candidate: stats('candidate'), meanScoreDelta: average(scoreDeltas), meanWinDelta: average(winDeltas), winDeltaSE: se(winDeltas), scoreDeltaSE: se(scoreDeltas),
    improvedWins: winDeltas.filter(d => d > 0).length, reducedWins: winDeltas.filter(d => d < 0).length, ownScoreLosses: scoreDeltas.filter(d => d < 0).length, ownScoreGains: scoreDeltas.filter(d => d > 0).length,
    changedBids: pairs.filter(p => p.candidate.lastBid?.actual !== p.control.lastBid?.actual).length, changedLastUsefulWinner: pairs.filter(p => p.candidate.lastUsefulResult.winner !== p.control.lastUsefulResult.winner).length,
    prefixDifferences: pairs.filter(p => p.control.prefixHash !== p.candidate.prefixHash).length };
}
for (const s of scenarios) {
  const control = play(s, false), candidate = play(s, true); report.pairs.push({ scenario: s, control, candidate });
  if (report.pairs.length % 12 === 0) {
    report.elapsedMs = performance.now() - started; writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ pairs: report.pairs.length, elapsedMs: report.elapsedMs, ...summary(report.pairs) }));
  }
}
report.summary = summary(report.pairs); report.byMode = Object.fromEntries(['SecondPrice', 'FirstPrice'].map(mode => [mode, summary(report.pairs.filter((p: any) => p.scenario.mode === mode))]));
report.elapsedMs = performance.now() - started; report.finishedAt = new Date().toISOString();
writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ complete: true, summary: report.summary, byMode: report.byMode, errors: report.errors.length, elapsedMs: report.elapsedMs }));
