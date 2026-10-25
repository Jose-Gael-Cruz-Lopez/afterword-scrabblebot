#!/usr/bin/env python3
"""Fit immutable ended-public rival-maximum priors; never connect to the arena.

These data are a training diagnostic, not an independent gameplay holdout.
All smoothing strengths below are fixed, not selected by cross-validation.
"""
from pathlib import Path
from collections import defaultdict
import hashlib
import json
import math
import statistics
import time

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
FIXTURE = HERE / 'latest-field-replay-input.json'
PAID_TABLE = REPO / 'bot-starter/src/reference-gaucho/params/market-paid.json'
OUTPUT = HERE / 'public-threshold-model.json'
TS_OUTPUT = REPO / 'bot-starter/src/reference-gaucho/threshold-prior.ts'
GRID = 32
VALUES = {**dict.fromkeys('AEIOULNSTR', 1), **dict.fromkeys('DG', 2), **dict.fromkeys('BCMP', 3), **dict.fromkeys('FHVWY', 4), 'K': 5, 'J': 8, 'X': 8, 'Q': 10, 'Z': 10}
SMOOTHING = dict(phase=40, countPhase=60, facePhase=24, countFacePhase=24, letterCountPhase=12)

def face_group(letter):
    if letter in 'AEIOU': return 'vowel'
    v = VALUES[letter]
    return 'common-consonant' if v == 1 else 'face-2-3' if v <= 3 else 'face-4-5' if v <= 5 else 'face-8-10'

def empirical(xs):
    d = defaultdict(float)
    if xs:
        for x in xs: d[x] += 1 / len(xs)
    return dict(d)

def mixture(a, b, weight_a):
    d = defaultdict(float)
    for x, w in a.items(): d[x] += w * weight_a
    for x, w in b.items(): d[x] += w * (1 - weight_a)
    return dict(d)

def shrink(xs, prior, strength):
    return mixture(empirical(xs), prior, len(xs) / (len(xs) + strength)) if xs else prior

def quantile(dist, p):
    s = 0
    for x in sorted(dist):
        s += dist[x]
        if s + 1e-12 >= p: return x
    return max(dist, default=0)

def grid_quantile(qs, p):
    x = min(1, max(0, p)) * GRID
    lo = min(GRID, int(x)); hi = min(GRID, lo + 1)
    return qs[lo] + (qs[hi] - qs[lo]) * (x - lo)

def fit(rows):
    # The last unusable award is excluded. Last usable auction gets a separate
    # tail bucket to avoid smearing all-in endgame bids across all late rounds.
    rows = [r for r in rows if r['remaining'] > 1]
    groups = defaultdict(list)
    for r in rows:
        t, n, letter, phase, fg = r['threshold'], r['count'], r['letter'], r['bucket'], r['faceGroup']
        for key in [('global',), ('phase', phase), ('countPhase', n, phase), ('facePhase', fg, phase), ('countFacePhase', n, fg, phase), ('leaf', n, letter, phase)]:
            groups[key].append(t)
    global_prior = empirical(groups['global',])
    tables = {}
    for n in [6, 7]:
        tables[n] = []
        for letter in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ':
            cells = []
            fg = face_group(letter)
            for phase in range(6):
                # Terminal maximum is its own empirical global prior (20 rows
                # in the full fixture), rather than regular-auction low prices.
                phase_prior = empirical(groups['phase', 5]) if phase == 5 and groups['phase', 5] else global_prior
                phase_prior = shrink(groups['phase', phase], phase_prior, SMOOTHING['phase'])
                n_prior = shrink(groups['countPhase', n, phase], phase_prior, SMOOTHING['countPhase'])
                fg_prior = shrink(groups['facePhase', fg, phase], phase_prior, SMOOTHING['facePhase'])
                parent = mixture(fg_prior, n_prior, .75)
                parent = shrink(groups['countFacePhase', n, fg, phase], parent, SMOOTHING['countFacePhase'])
                leaf = groups['leaf', n, letter, phase]
                dist = shrink(leaf, parent, SMOOTHING['letterCountPhase'])
                cells.append(dict(n=len(leaf), groupN=len(groups['countFacePhase', n, fg, phase]), phaseN=len(groups['countPhase', n, phase]), q=[quantile(dist, i / GRID) for i in range(GRID + 1)]))
            tables[n].append(cells)
    return tables

def basic(xs):
    xs = sorted(xs)
    return dict(n=len(xs), mean=statistics.mean(xs) if xs else None, **{f'q{round(p*100)}': xs[min(len(xs)-1, int((len(xs)-1)*p))] if xs else None for p in [.1,.25,.5,.75,.9,.95]}, max=max(xs, default=None))

def summarize(rows):
    if not rows: return dict(n=0)
    return dict(n=len(rows), threshold=basic([r['threshold'] for r in rows]), paid=basic([r['paid'] for r in rows]), gap=basic([r['threshold']-r['paid'] for r in rows]), fractionThresholdAbovePaidPlus2=sum(r['threshold'] > r['paid']+2 for r in rows)/len(rows), ownOriginalWin=sum(r['ownOriginalWin'] for r in rows), matchCount=len(set(r['matchId'] for r in rows)))

def prediction_metrics(cases):
    out = {}
    for key in ['staticPaidPlus2', 'recentPublicPaidPlus2', 'hierarchicalPrior']:
        xs = [c[key] for c in cases]
        actual = [c['threshold'] for c in cases]
        means = [sum(grid_quantile(q, (i+.5)/64) for i in range(64))/64 for q in xs]
        medians = [grid_quantile(q, .5) for q in xs]
        pinball = {}; coverage = {}
        for p in [.5,.8,.9]:
            qs = [grid_quantile(q, p) for q in xs]
            pinball[str(p)] = sum(max(p*(y-q),(p-1)*(y-q)) for y,q in zip(actual,qs))/len(cases)
            coverage[str(p)] = sum(y<=q for y,q in zip(actual,qs))/len(cases)
        # CRPS via the quantile representation: integral 2*pinball over p.
        crps = 0
        for c, qs in zip(cases, xs):
            y = c['threshold']
            crps += sum(2*max(p*(y-grid_quantile(qs,p)),(p-1)*(y-grid_quantile(qs,p))) for p in [(i+.5)/64 for i in range(64)])/64
        out[key] = dict(n=len(cases), meanPrediction=statistics.mean(means), meanActual=statistics.mean(actual), meanPredictionBias=statistics.mean([p-y for p,y in zip(means,actual)]), medianMAE=statistics.mean([abs(p-y) for p,y in zip(medians,actual)]), meanRMSE=math.sqrt(statistics.mean([(p-y)**2 for p,y in zip(means,actual)])), pinball=pinball, coverage=coverage, CRPS=crps/len(cases))
    return out

started = time.monotonic()
fixture_bytes = FIXTURE.read_bytes()
fixture = json.loads(fixture_bytes)
paid_table = json.loads(PAID_TABLE.read_bytes())
rows = []
for game in fixture['games']:
    total = len(game['auctions'])
    for i, a in enumerate(game['auctions']):
        own = a['actualWinner'] == game['ownBotId']
        # Never use archived own maximum as a rival label.
        threshold = a['actualPaid'] if own else a['archivedWinningBid'] if a['actualWinner'] is not None else 0
        assert isinstance(threshold, (int,float)) and threshold >= 0
        assert threshold == a['rivalThreshold'], (game['id'], a['round'], threshold, a['rivalThreshold'])
        remaining = total-i
        phase = min(4, int((a['round']-1)*5/total))
        rows.append(dict(matchId=game['id'], count=game['playerCount'], letter=a['letter'], faceValue=VALUES[a['letter']], faceGroup=face_group(a['letter']), round=a['round'], total=total, remaining=remaining, phase=phase, bucket=5 if remaining==2 else phase, threshold=int(threshold), paid=a['actualPaid'], ownOriginalWin=own, conservativeReserveAmbiguity=bool(a.get('rivalThresholdReserveAmbiguous'))))

# Leave out whole games. Each held-out fit is independent of its threshold
# labels; a rolling baseline uses only preceding *public paid* observations.
cross_validation = []
for held in fixture['games']:
    tables = fit([r for r in rows if r['matchId'] != held['id']])
    held_rows = [r for r in rows if r['matchId'] == held['id']]
    for i, row in enumerate(held_rows):
        if row['remaining'] <= 1: continue
        base = paid_table[ord(row['letter'])-65][row['phase']] + 2
        history = [r for r in held_rows[:i] if r['paid']>0][-36:]
        same = [r['paid'] for r in history if r['letter']==row['letter']]
        observed = same if len(same)>=3 else [r['paid'] for r in history if abs(r['faceValue']-row['faceValue'])<=1]
        recent = empirical([p+2 for p in observed]) if len(observed)>=4 else empirical([base])
        cell = tables[row['count']][ord(row['letter'])-65][row['bucket']]
        cross_validation.append(dict(matchId=row['matchId'], count=row['count'], threshold=row['threshold'], staticPaidPlus2=[base]*(GRID+1), recentPublicPaidPlus2=[quantile(recent,i/GRID) for i in range(GRID+1)], hierarchicalPrior=cell['q']))

tables = fit(rows)
report = dict(
    purpose='Fixed historical rival-winning-threshold prior. Training diagnostic only; must pass separate fresh reactive holdout before any policy adoption.',
    fixture=dict(path=str(FIXTURE.relative_to(REPO)), sha256=hashlib.sha256(fixture_bytes).hexdigest(), matches=len(fixture['games']), ids=[g['id'] for g in fixture['games']], rows=len(rows), playerCounts={str(n):sum(g['playerCount']==n for g in fixture['games']) for n in [6,7]}, sourceScope=fixture.get('scope')),
    labelRule='When originally own win: public paid is rival maximum (reserve1 conservatively ambiguous0/1). Other winner: ended archived winning maximum. No winner:0. Never use our archived winning maximum as rival threshold.',
    labelCounts=dict(ownOriginalWinPaid=sum(r['ownOriginalWin'] for r in rows), otherOrNoOriginalWinner=len(rows)-sum(r['ownOriginalWin'] for r in rows), conservativeReserveAmbiguity=sum(r['conservativeReserveAmbiguity'] for r in rows)),
    phaseRule='phase=min(4,floor(5*(round-1)/(round+roundsRemaining-1))); roundsRemaining includes current auction. Sampler separately uses last-usable bucket5 at remaining2; remaining1 is unusable and returns0.',
    model=dict(type='Hierarchical empirical quantile prior, fixed smoothing, no tuned hyperparameters', smoothingPseudoCounts=SMOOTHING, parentMixture='0.75 face×phase +0.25 count×phase, then count×face×phase, then count×letter×phase', quantileGridIntervals=GRID, counts=list(tables), tables=tables, clamp='Optional hard upper bound max known public opponent balance, excluding focal seat. Disable for hypothetical future steps, where future opponent cashouts are unknown.'),
    allAuctions=summarize(rows), usableAuctions=summarize([r for r in rows if r['remaining']>1]), otherOriginalWinner=summarize([r for r in rows if not r['ownOriginalWin']]),
    byCount={str(n):summarize([r for r in rows if r['count']==n]) for n in [6,7]},
    byPhase={str(p):summarize([r for r in rows if r['phase']==p]) for p in range(5)},
    byFaceGroup={fg:summarize([r for r in rows if r['faceGroup']==fg]) for fg in sorted(set(r['faceGroup'] for r in rows))},
    byCountFaceGroup={str(n):{fg:summarize([r for r in rows if r['count']==n and r['faceGroup']==fg]) for fg in sorted(set(r['faceGroup'] for r in rows))} for n in [6,7]},
    byLetter={l:summarize([r for r in rows if r['letter']==l]) for l in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'},
    byLetterPhase={l:{str(p):summarize([r for r in rows if r['letter']==l and r['phase']==p]) for p in range(5)} for l in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'},
    byFaceGroupPhase={fg:{str(p):summarize([r for r in rows if r['faceGroup']==fg and r['phase']==p]) for p in range(5)} for fg in sorted(set(r['faceGroup'] for r in rows))},
    terminalLastUsable=summarize([r for r in rows if r['remaining']==2]), finalUnusable=summarize([r for r in rows if r['remaining']==1]),
    leaveOneMatchOut=dict(method='Each model trained on19 matches, tested on remaining whole match. Fixed strengths, no hyperparameter selection. All usable auctions; no current balance caps available in fixture, so evaluation is unclamped.', metrics=prediction_metrics(cross_validation), byCount={str(n):prediction_metrics([c for c in cross_validation if c['count']==n]) for n in [6,7]}),
    caveats=['20 games are observational, not randomized; seven-player strata contain only2 games.', 'Auction rows within a match are dependent; reported errors are predictive summaries, not independent-row confidence intervals.', 'Own wins have selection-dependent labels equal to paid; other-winner archived maxima are the relevant missing upper-order statistic.', 'Empirical priors need fresh reactive policy evaluation. Leave-one-match-out predictive calibration is not an independent gameplay test.', 'Actual rival balances at each auction are not included in the immutable compact fixture. Hard balance caps are applied only from caller-provided current public context, and cannot be cross-validated here.'],
    elapsedSeconds=time.monotonic()-started,
)
assert FIXTURE.read_bytes() == fixture_bytes, 'Raw fixture changed during fit'
OUTPUT.write_text(json.dumps(report,indent=2)+'\n')

compact = {str(n):[[[c['n'],c['groupN'],c['phaseN'],c['q']] for c in cells] for cells in tables[n]] for n in [6,7]}
header = '''/** Fixed public-ended-match threshold prior; training diagnostic, not a deployed policy.
 * Generated by docs/experiments/public-threshold-fitter.py. Never reads any
 * current bid, private rack, network, credentials, or mutable historical file.
 * Fresh reactive gameplay validation is required before policy adoption.
 */
export interface ThresholdContext {
  letter?: string; round?: number; roundsRemaining?: number; seat?: number;
  playerCount?: number; players?: ReadonlyArray<{ seat?: number; balance: number }>;
}
export interface ThresholdPriorOptions {
  /** True for a current auction. Set false for future simulated steps: known
   * current balances do not cap unknown future capital earned from cashouts. */
  clampToPublicBalances?: boolean;
}
export interface ThresholdPriorInfo {
  readonly phase: number; readonly bucket: number; readonly playerCount: number;
  readonly letterSamples: number; readonly faceGroupSamples: number;
  readonly countPhaseSamples: number; readonly cap: number | null;
  readonly quantiles: readonly number[];
}
export const THRESHOLD_PRIOR_PROVENANCE = Object.freeze({
  source: '20 verified ended public matches; no live hidden information',
  fixtureSHA256: 'FIXTURE_HASH', matches: 20, sixPlayerMatches: 18,
  sevenPlayerMatches: 2, trainingOnly: true, quantileIntervals: 32,
});
type Cell = readonly [number, number, number, readonly number[]];
const TABLE: Readonly<Record<string, readonly (readonly Cell[])[]>> = COMPACT_DATA;

export function rivalThresholdPrior(ctx: ThresholdContext, options: ThresholdPriorOptions = {}): ThresholdPriorInfo {
  const round = Math.max(1, Math.floor(ctx.round ?? 1));
  const remaining = Math.max(0, Math.floor(ctx.roundsRemaining ?? 60));
  const phase = Math.min(4, Math.floor(5 * (round - 1) / Math.max(1, round + remaining - 1)));
  const bucket = remaining === 2 ? 5 : phase;
  const count = ctx.playerCount ?? ctx.players?.length ?? 6;
  // Only6/7 were observed. Other counts conservatively use the nearest prior
  // and expose that support limitation through playerCount/provenance.
  const modelCount = count >= 7 ? 7 : 6;
  const letter = (ctx.letter ?? '').toUpperCase().charCodeAt(0) - 65;
  const cell = TABLE[String(modelCount)]![letter >= 0 && letter < 26 ? letter : 0]![bucket]!;
  let cap: number | null = null;
  if (options.clampToPublicBalances !== false && ctx.players?.length) {
    const balances = ctx.players.filter((p, index) => (p.seat ?? index) !== ctx.seat)
      .map(p => p.balance).filter(n => Number.isFinite(n) && n >= 0);
    if (balances.length) cap = Math.max(...balances.map(Math.floor));
  }
  const qs = remaining <= 1 || letter < 0 || letter >= 26 ? cell[3].map(() => 0)
    : cap === null ? cell[3] : cell[3].map(q => Math.min(q, cap!));
  return { phase, bucket, playerCount: modelCount, letterSamples: cell[0], faceGroupSamples: cell[1], countPhaseSamples: cell[2], cap, quantiles: qs };
}

/** Rival maximum threshold, not a bid recommendation. A conservative simulated
 * win uses bid>threshold and Vickrey payment=max(1,threshold); tied bids are random. */
export function estimateRivalThreshold(ctx: ThresholdContext, quantile = .5, options: ThresholdPriorOptions = {}): number {
  const qs = rivalThresholdPrior(ctx, options).quantiles;
  const p = Number.isFinite(quantile) ? Math.max(0, Math.min(1, quantile)) : .5;
  const x = p * 32, lo = Math.floor(x), hi = Math.min(32, lo + 1);
  return Math.max(0, Math.round(qs[lo]! + (qs[hi]! - qs[lo]!) * (x - lo)));
}
export function sampleRivalThreshold(ctx: ThresholdContext, rng: () => number, options: ThresholdPriorOptions = {}): number {
  return estimateRivalThreshold(ctx, rng(), options);
}
'''
TS_OUTPUT.write_text(header.replace('FIXTURE_HASH',hashlib.sha256(fixture_bytes).hexdigest()).replace('COMPACT_DATA',json.dumps(compact,separators=(',',':'))))
print(json.dumps(dict(rows=len(rows), usable=report['usableAuctions']['n'], metrics=report['leaveOneMatchOut']['metrics'], elapsedSeconds=report['elapsedSeconds'], output=str(OUTPUT), sampler=str(TS_OUTPUT)),indent=2))
