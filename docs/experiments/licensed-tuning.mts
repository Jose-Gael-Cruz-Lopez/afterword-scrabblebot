/** Offline matched parameter search; no credentials, network, or live changes.
 * bot-starter/node_modules/.bin/tsx docs/experiments/licensed-tuning.mts
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createGauchoReference } from '../../bot-starter/src/reference-gaucho/adapter.ts';
import type { Params } from '../../bot-starter/src/reference-gaucho/core/policy.ts';
import { runMatch, loadDictionary, type SimStrategy, type SimContext, type SimAuctionType } from '../../bot-starter/src/simulate.ts';
import { WordEngine } from '../../bot-starter/src/engine.ts';
const dictionary = loadDictionary(), engine = new WordEngine(dictionary);
interface Candidate { name: string; overrides: Partial<Params> }
const candidates: Candidate[] = [
  { name: 'cashflow-32', overrides: { lowCash: 20, minPlayReward: 32 } },
  { name: 'liquid-28', overrides: { lowCash: 26, minPlayReward: 28, holdKappa: .72 } },
  { name: 'long-builder', overrides: { minPlayReward: 48, maxMissing: 3, pBase: .90, aHalf: .6 } },
  { name: 'spend-plus', overrides: { c0: .65, c1: .15, lowCash: 18 } },
  { name: 'spend-double', overrides: { c0: .85, c1: .1, beta: 1.6, lowCash: 22 } },
  { name: 'specialist', overrides: { alpha: 1.35, beta: 1.2, c0: .45, lowCash: 16 } },
  { name: 'conservative', overrides: { alpha: 1.05, beta: 1.5, c0: .35, lowCash: 15 } },
  { name: 'short-horizon', overrides: { horizonW: 1.55, pBase: .92, aHalf: .6, lowCash: 14, minPlayReward: 36 } },
  { name: 'early-cap', overrides: { capBase: .45, capPow: 1.4, lowCash: 16, minPlayReward: 36, c0: .58 } },
  { name: 'spend-cashflow', overrides: { c0: .65, c1: .15, lowCash: 20, minPlayReward: 34 } },
  { name: 'broad-builder', overrides: { maxMissing: 3, pBase: .90, minPlayReward: 38, lowCash: 16, c0: .6 } },
  { name: 'horizon-specialist', overrides: { horizonW: 1.6, alpha: 1.25, gamma: 2, c0: .55, lowCash: 16, minPlayReward: 36 } },
];
function gaucho(name: string, overrides: Partial<Params> = {}): SimStrategy {
  return createGauchoReference(dictionary, { name, overrides, terminalSafe: true });
}
function pressure(price: number): SimStrategy {
  return { name: `pressure-${price}`,
    word(c) {
      const words = engine.playable(c.myRack);
      if (c.roundsRemaining <= 2) return engine.bestPacking(c.myRack, { timeBudgetMs: 4, maxNodes: 500 }).words[0] ?? null;
      return (c.myBalance < price || c.roundsRemaining <= 6 ? words[0] : words.find(w => w.length >= 7))?.word ?? null;
    },
    bid(c) {
      if (c.roundsRemaining <= 1) return 0;
      const before = engine.playable(c.myRack)[0]?.score ?? 0;
      const next = new Map(c.myRack); next.set(c.letter, (next.get(c.letter) ?? 0) + 1);
      const gain = (engine.playable(next)[0]?.score ?? 0) - before;
      return Math.min(c.myBalance, Math.max(price, Math.floor(gain * 1.1)));
    },
  };
}
function patient(): SimStrategy {
  return { name: 'patient-seven',
    word(c) { const words = engine.playable(c.myRack); return (c.roundsRemaining <= 2 || c.myBalance < 12 ? words[0] : words.find(w => w.length >= 7))?.word ?? null; },
    bid: c => c.roundsRemaining <= 1 ? 0 : Math.min(c.myBalance, 14),
  };
}
const rosters: Array<{ name: string; opponents: Array<() => SimStrategy> }> = [
  { name: 'licensed-clones-and-mutants', opponents: [() => gaucho('clone-A'), () => gaucho('clone-B'), () => gaucho('aggressive', { c0: .7, lowCash: 18 }), () => gaucho('liquid', { lowCash: 20, minPlayReward: 32 }), patient] },
  { name: 'licensed-and-price-pressure', opponents: [() => gaucho('clone-A'), () => gaucho('aggressive', { c0: .7, lowCash: 18 }), () => pressure(14), () => pressure(16), () => pressure(18)] },
  { name: 'licensed-and-patient', opponents: [() => gaucho('clone-A'), () => gaucho('long', { minPlayReward: 50, pBase: .92 }), () => gaucho('liquid', { lowCash: 20, minPlayReward: 32 }), patient, () => pressure(16)] },
];
interface Scenario { seed: number; mode: SimAuctionType; seat: number; roster: number }
function scenarios(countPerMode: number, start: number): Scenario[] {
  const out: Scenario[] = [];
  for (const mode of ['SecondPrice', 'FirstPrice'] as const) for (let n = 0; n < countPerMode; n++) {
    out.push({ seed: start + n * 7919 + (mode === 'FirstPrice' ? 1_000_003 : 0), mode, seat: n % 6, roster: n % 3 });
  }
  return out;
}
interface Outcome { score: number; win: number; rank: number; balance: number; spent: number; tiles: number; maxDecisionMs: number; meanDecisionMs: number; words: number; meanWordLength: number; errorCount: number }
let games = 0;
const errors: string[] = [];
function play(s: Scenario, candidate?: Candidate): Outcome {
  const players = rosters[s.roster]!.opponents.map(f => f());
  players.splice(s.seat, 0, gaucho(candidate?.name ?? 'baseline-control', candidate?.overrides));
  const result = runMatch(players, s.seed, { dictionary, auctionType: s.mode });
  games++; errors.push(...result.errors);
  const p = result.players[s.seat]!, top = Math.max(...result.players.map(p => p.score));
  return { score: p.score, win: p.score === top ? 1 / result.players.filter(p => p.score === top).length : 0,
    rank: 1 + result.players.filter(o => o.score > p.score).length, balance: p.balance, spent: p.spent, tiles: p.tilesWon,
    maxDecisionMs: Math.max(p.maxBidMs, p.maxWordMs), meanDecisionMs: (p.bidMs + p.wordMs) / (p.bidCalls + p.wordCalls),
    words: p.words.length, meanWordLength: p.words.length ? p.words.reduce((n, w) => n + w.length, 0) / p.words.length : 0,
    errorCount: result.errors.length };
}
function summarize(xs: Outcome[]) {
  const n = xs.length;
  return { games: n, wins: xs.reduce((a, x) => a + x.win, 0), winRate: xs.reduce((a, x) => a + x.win, 0) / n,
    meanScore: xs.reduce((a, x) => a + x.score, 0) / n, meanRank: xs.reduce((a, x) => a + x.rank, 0) / n,
    meanBalance: xs.reduce((a, x) => a + x.balance, 0) / n, meanSpent: xs.reduce((a, x) => a + x.spent, 0) / n,
    meanTiles: xs.reduce((a, x) => a + x.tiles, 0) / n, maxDecisionMs: Math.max(...xs.map(x => x.maxDecisionMs)),
    meanDecisionMs: xs.reduce((a, x) => a + x.meanDecisionMs, 0) / n };
}
function paired(control: Outcome[], candidate: Outcome[]) {
  const scoreDelta = candidate.map((x, i) => x.score - control[i]!.score), winDelta = candidate.map((x, i) => x.win - control[i]!.win);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const se = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1) / xs.length); };
  return { meanScoreDelta: mean(scoreDelta), meanWinDelta: mean(winDelta), scoreDeltaSE: se(scoreDelta), winDeltaSE: se(winDelta),
    higherScore: scoreDelta.filter(d => d > 0).length, lowerScore: scoreDelta.filter(d => d < 0).length, tiedScore: scoreDelta.filter(d => d === 0).length };
}
const report: any = { name: 'licensed-tuning', terminalSafe: true, upstreamCommit: 'f2dce03a99e01a88ef9fdf2e300b50ef592c4c50', startedAt: new Date().toISOString(),
  methodology: 'Parameters only; current licensed policy fixed terminalSafe=true. Three rosters contain strong licensed clones/mutants plus price-pressure/patient bots. Every candidate replaces control in exactly same seat/seed/opponents. Train24 scenarios; select jointly improved candidate before creating untouched holdout48 paired scenarios. No online or private opponent data.',
  rosters: rosters.map(r => r.name), candidates,
  sourceHashes: Object.fromEntries(['../../bot-starter/src/reference-gaucho/adapter.ts', '../../bot-starter/src/reference-gaucho/core/policy.ts', '../../bot-starter/src/reference-gaucho/params/vickrey.json', '../../bot-starter/src/reference-gaucho/params/firstprice.json'].map(file => [file, createHash('sha256').update(readFileSync(new URL(file, import.meta.url))).digest('hex')])),
  trainScenarios: scenarios(12, 730_200_011), training: [], errors,
};
const output = new URL('./licensed-tuning-report.json', import.meta.url), started = performance.now();
const controls = report.trainScenarios.map((s: Scenario) => play(s));
report.trainingControl = summarize(controls);
for (const candidate of candidates) {
  const outcomes = report.trainScenarios.map((s: Scenario) => play(s, candidate));
  const row = { candidate, summary: summarize(outcomes), paired: paired(controls, outcomes), outcomes };
  report.training.push(row); report.games = games; report.elapsedMs = performance.now() - started;
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ stage: 'train', name: candidate.name, ...row.summary, ...row.paired, games, elapsedMs: report.elapsedMs }));
}
const eligible = report.training.filter((r: any) => r.paired.meanScoreDelta > 0 && r.paired.meanWinDelta > 0)
  .sort((a: any, b: any) => b.paired.meanWinDelta - a.paired.meanWinDelta || b.paired.meanScoreDelta - a.paired.meanScoreDelta);
const selected = eligible[0] ?? [...report.training].sort((a: any, b: any) => b.paired.meanWinDelta - a.paired.meanWinDelta || b.paired.meanScoreDelta - a.paired.meanScoreDelta)[0];
report.selectedBeforeHoldout = selected.candidate;
report.trainingHadJointImprovement = eligible.length > 0;
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
const holdoutScenarios = scenarios(24, 930_700_031), holdoutControl: Outcome[] = [], holdoutCandidate: Outcome[] = [];
for (const s of holdoutScenarios) {
  holdoutControl.push(play(s)); holdoutCandidate.push(play(s, selected.candidate));
  if (holdoutControl.length % 12 === 0) console.log(JSON.stringify({ stage: 'holdout', pairedScenarios: holdoutControl.length, games, elapsedMs: performance.now() - started }));
}
report.holdout = { scenarios: holdoutScenarios, control: summarize(holdoutControl), candidate: summarize(holdoutCandidate), paired: paired(holdoutControl, holdoutCandidate),
  byMode: Object.fromEntries(['SecondPrice', 'FirstPrice'].map(mode => {
    const indices = holdoutScenarios.flatMap((s, i) => s.mode === mode ? [i] : []), a = indices.map(i => holdoutControl[i]!), b = indices.map(i => holdoutCandidate[i]!);
    return [mode, { control: summarize(a), candidate: summarize(b), paired: paired(a, b) }];
  })), controlOutcomes: holdoutControl, candidateOutcomes: holdoutCandidate };
report.recommendation = report.holdout.paired.meanWinDelta > 0 && report.holdout.paired.meanScoreDelta > 0 && errors.length === 0 ? 'candidate improved observed holdout win rate and score; review uncertainty before live adoption' : 'keep current production parameters; candidate failed joint heldout improvement';
report.games = games; report.finishedAt = new Date().toISOString(); report.elapsedMs = performance.now() - started;
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ stage: 'complete', selected: report.selectedBeforeHoldout, games, errors: errors.length, control: report.holdout.control, candidate: report.holdout.candidate, paired: report.holdout.paired, recommendation: report.recommendation, elapsedMs: report.elapsedMs }));
