import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { WordEngine, wordReward } from './engine.js';
import { EndgamePlanner, type EndgameContext } from './endgame.js';
function rack(letters: string): Map<string, number> { const r = new Map<string, number>(); for (const c of letters) r.set(c, (r.get(c) ?? 0) + 1); return r; }
const history = [1, 1, 1, 1].map(paid => ({ letter: 'A', paid }));
const context = (letters: string, overrides: Partial<EndgameContext> = {}): EndgameContext => ({ myRack: rack(letters), myBalance: 100, letter: 'T', roundsRemaining: 3, history, ...overrides });
function legal(word: string | null, letters: ReadonlyMap<string, number>): void { if (!word) return; const rest = new Map(letters); for (const c of word) { assert.ok((rest.get(c) ?? 0) > 0); rest.set(c, rest.get(c)! - 1); } }

test('final unusable auction flushes existing points and never buys its tile', () => {
  const p = new EndgamePlanner(new WordEngine(['QI', 'QUIZ', 'AT']));
  const d = p.plan(context('QIAT', { letter: 'Z', roundsRemaining: 1 }));
  assert.equal(d.active, true); assert.equal(d.bid, 0); assert.equal(d.word, 'QI'); assert.equal(d.reason, 'final-flush');
});
test('penultimate auction holds a positive-bankroll rack for a profitable last purchase', () => {
  const p = new EndgamePlanner(new WordEngine(['AT', 'CAT', 'TACT']));
  const d = p.plan(context('TAC', { myBalance: 7, roundsRemaining: 2 }));
  assert.equal(d.word, null); assert.equal(d.bid, 7); assert.equal(d.exact, true); assert.ok(d.estimatedGain > 0);
});
test('last useful purchase uses all cash even when score gain is smaller', () => {
  const p = new EndgamePlanner(new WordEngine(['AT', 'CAT', 'TACT']));
  const d = p.plan(context('TAC', { myBalance: 100, roundsRemaining: 2 }));
  assert.equal(d.bid, 100); assert.equal(d.word, null);
});
test('duplicate counts prevent a false profitable last purchase', () => {
  const p = new EndgamePlanner(new WordEngine(['QUIZZES', 'QI']));
  assert.equal(p.plan(context('QUIES', { letter: 'Z', roundsRemaining: 2 })).bid, 0);
});
test('zero bankroll cashes out an independent word to fund the final useful tile', () => {
  const p = new EndgamePlanner(new WordEngine(['QI', 'AT', 'TACT']));
  const ctx = context('QITAC', { myBalance: 0, roundsRemaining: 2 }); const d = p.plan(ctx);
  assert.equal(d.word, 'QI'); assert.equal(d.bid, wordReward('QI')); legal(d.word, ctx.myRack);
});
test('sampled waiting preserves letters needed for a known current completion', () => {
  const p = new EndgamePlanner(new WordEngine(['AT', 'TACT']));
  const d = p.plan(context('TAC', { baselineWord: 'AT', baselineBid: 0, remainingDistribution: new Map() }), { samples: 8, seed: 92 });
  assert.equal(d.active, true); assert.equal(d.word, null); assert.ok(d.bid > 0); assert.ok(d.estimatedGain >= 7); assert.equal(d.exact, false);
});
test('sampled future completion favors WAIT over an irreversible small cashout', () => {
  const p = new EndgamePlanner(new WordEngine(['AT', 'TACT']));
  const d = p.plan(context('TAC', { letter: 'Z', roundsRemaining: 4, myBalance: 10, baselineWord: 'AT', remainingDistribution: new Map([['T', 1], ['U', 1]]) }), { samples: 8, seed: 251 });
  assert.equal(d.active, true); assert.equal(d.word, null); assert.equal(d.bid, 0); assert.ok(d.estimatedGain >= 7);
});
test('sampled cashout funds a better future word instead of inventing free purchases', () => {
  const p = new EndgamePlanner(new WordEngine(['QI', 'AT', 'TACT']));
  const ctx = context('QITAC', { letter: 'Z', myBalance: 0, remainingDistribution: new Map([['T', 1]]) });
  const d = p.plan(ctx, { samples: 8, seed: 7 });
  assert.equal(d.active, true); assert.equal(d.word, 'QI'); assert.equal(d.bid, 0); assert.ok(d.estimatedGain >= 7); legal(d.word, ctx.myRack);
});
test('fixed seeds reproduce complete small searches with paired samples', () => {
  const p = new EndgamePlanner(new WordEngine(['AT', 'TACT', 'QI', 'CAT']));
  const ctx = context('QITAC', { roundsRemaining: 5, myBalance: 25, remainingDistribution: new Map([['T', 2], ['A', 1], ['X', 1]]) });
  const a = p.plan(ctx, { seed: 113, samples: 12, minimumGain: 0 }), b = p.plan(ctx, { seed: 113, samples: 12, minimumGain: 0 });
  for (const k of ['word', 'bid', 'active', 'samples', 'estimatedGain', 'reason'] as const) assert.equal(a[k], b[k]);
});
test('outside horizon or exhausted budget preserves the supplied baseline', () => {
  const p = new EndgamePlanner(new WordEngine(['AT', 'TACT'])); const ctx = context('TAC', { baselineWord: 'AT', baselineBid: 2 });
  assert.equal(p.plan({ ...ctx, roundsRemaining: 30 }).word, 'AT');
  const d = p.plan(ctx, { timeBudgetMs: 0 }); assert.equal(d.active, false); assert.equal(d.word, 'AT'); assert.equal(d.bid, 2); assert.equal(d.reason, 'budget');
});
test('planning preserves private rack and supplied public distribution', () => {
  const p = new EndgamePlanner(new WordEngine(['AT', 'TACT'])); const ctx = context('TAC', { remainingDistribution: new Map([['T', 2], ['X', 1]]) });
  const before = structuredClone(ctx), d = p.plan(ctx, { samples: 4 }); assert.deepEqual(ctx, before); legal(d.word, ctx.myRack);
  assert.ok(Number.isInteger(d.bid)); assert.ok(d.bid >= 0 && d.bid <= ctx.myBalance + (d.word ? wordReward(d.word) : 0));
});
test('full dictionary returns within a bounded worker budget', () => {
  const words = readFileSync(new URL('../../spacetimedb/wordlist.txt', import.meta.url), 'utf8').split('\n'); const p = new EndgamePlanner(new WordEngine(words));
  const ctx = context('JAZZEDATINORST', { letter: 'E', roundsRemaining: 8, myBalance: 30, history: [12,14,16,18].map(paid => ({letter:'E',paid})) });
  const start = performance.now(), d = p.plan(ctx, { timeBudgetMs: 100, samples: 8 }), ms = performance.now() - start;
  assert.ok(ms < 350, `bounded planner took ${ms.toFixed(1)}ms`); legal(d.word, ctx.myRack); assert.ok(Number.isFinite(d.bid));
  console.info(`EndgamePlanner: ${d.samples} paired samples in ${ms.toFixed(1)}ms; ${d.reason}`);
});
