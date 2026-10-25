/** Fresh, seat-balanced, six-player competitive validation of a licensed policy. */
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadDictionary, runMatch, type SimStrategy, type SimContext, type SimAuctionType } from '../simulate.js';
import { createStrategy } from '../strategy.js';
import { WordEngine } from '../engine.js';
import { createGauchoReference } from './adapter.js';

const dictionary = loadDictionary();
const engine = new WordEngine(dictionary);
const oursParams = { bidScale: 2, minimumBid: 4, maximumSpendFraction: .7, marketRebuild: false };
function ours(): SimStrategy {
  const p = createStrategy(dictionary, oursParams);
  let initialRack: Map<string, number> | undefined;
  const ctx = (c: SimContext) => { initialRack ??= new Map(c.myRack); return { ...c, initialRack }; };
  return { name: 'Afterword terminal-corrected', bid: c => p.decideBid(ctx(c)), word: c => p.chooseWord(ctx(c)) };
}
function pressure(price: number): SimStrategy {
  return { name: `pressure-${price}`, bid: c => c.roundsRemaining <= 1 ? 0 : Math.min(c.myBalance, price),
    word: c => engine.playable(c.myRack)[0]?.word ?? null };
}
function patient(): SimStrategy {
  return { name: 'patient-7', bid: c => c.roundsRemaining <= 1 ? 0 : Math.min(c.myBalance, 14),
    word: c => {
      const playable = engine.playable(c.myRack);
      return (c.roundsRemaining <= 2 || c.myBalance < 12 ? playable[0] : playable.find(w => w.length >= 7))?.word ?? null;
    } };
}
const factories = [ours, () => createGauchoReference(dictionary, { terminalSafe: false }), () => pressure(14), () => pressure(16), () => pressure(18), patient];
const modes: SimAuctionType[] = ['SecondPrice', 'FirstPrice'];
const report: any = { upstreamCommit: 'f2dce03a99e01a88ef9fdf2e300b50ef592c4c50', params: oursParams,
  seedStart: 2026120101, gamesPerMode: 12, referenceOptions: { terminalSafe: false },
  sourceHashes: Object.fromEntries(['./adapter.ts', './core/policy.ts', '../strategy.ts'].map(file => [file, createHash('sha256').update(readFileSync(new URL(file, import.meta.url))).digest('hex')])), description: 'Final confirmation: licensed reference explicitly terminalSafe=false versus frozen original2/4/.7/marketRebuildfalse, pressure14/16/18 and patient7. Twelve fresh seeds per mode, all six seats exactly twice per mode. Public learned market table enabled for licensed reference. Patient holds for 7+ letters unless low cash or final two auctions.', modes: [], errors: [] };
const started = performance.now();
for (const mode of modes) {
  const totals = factories.map(f => ({ name: f().name, wins: 0, score: 0, balance: 0, rank: 0, maxDecisionMs: 0, decisionMs: 0, decisionCalls: 0, seats: Array(6).fill(0) }));
  let referenceAhead = 0, oursAhead = 0, equal = 0;
  for (let game = 0; game < 12; game++) {
    const rotation = game % 6;
    const order = factories.map((_, i) => (i + rotation) % 6);
    const seed = report.seedStart + game + (mode === 'FirstPrice' ? 1000 : 0);
    const result = runMatch(order.map(i => factories[i]!()), seed, { dictionary, auctionType: mode });
    report.errors.push(...result.errors);
    const max = Math.max(...result.players.map(p => p.score));
    const ties = result.players.filter(p => p.score === max).length;
    let ourScore = 0, refScore = 0;
    result.players.forEach((p, seat) => {
      const index = order[seat]!, t = totals[index]!;
      t.wins += p.score === max ? 1 / ties : 0; t.score += p.score; t.balance += p.balance;
      t.rank += 1 + result.players.filter(x => x.score > p.score).length;
      t.maxDecisionMs = Math.max(t.maxDecisionMs, p.maxBidMs, p.maxWordMs);
      t.decisionMs += p.bidMs + p.wordMs; t.decisionCalls += p.bidCalls + p.wordCalls;
      t.seats[seat]++;
      if (index === 0) ourScore = p.score;
      if (index === 1) refScore = p.score;
    });
    if (refScore > ourScore) referenceAhead++; else if (ourScore > refScore) oursAhead++; else equal++;
    console.log(JSON.stringify({ mode, game: game + 1, seed, ourScore, refScore, elapsedMs: Math.round(performance.now() - started), errors: result.errors.length }));
  }
  const summary = { mode, games: 12, referenceAhead, oursAhead, equal,
    rows: totals.map(t => ({ name: t.name, wins: t.wins, winRate: t.wins / 12, meanScore: t.score / 12,
      meanBalance: t.balance / 12, meanRank: t.rank / 12, maxDecisionMs: t.maxDecisionMs, meanDecisionMs: t.decisionMs / t.decisionCalls, decisionCalls: t.decisionCalls, seatCounts: t.seats })) };
  report.modes.push(summary);
  console.log(JSON.stringify(summary));
}
report.elapsedMs = performance.now() - started;
writeFileSync(new URL('./final-confirmation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ complete: true, elapsedMs: report.elapsedMs, errors: report.errors.length }));
