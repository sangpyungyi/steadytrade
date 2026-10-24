// Backtest engine — the same files the strategy lab runs in your browser.
// Fixture: Binance BTC/USDT 4h, 300 closed bars ending 2026-10-14 20:00 UTC (public market data).
// Run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCycle, CYCLE_DEFAULTS } from '../src/backtest/cycle.js';
import { fromSpec } from '../src/schema/run.js';
import { validateSpec, SpecError } from '../src/schema/spec.js';
import { DEFAULT_ASSUMPTIONS } from '../src/backtest/engine.js';

const bars = JSON.parse(readFileSync(new URL('./fixtures/btcusdt-4h.json', import.meta.url), 'utf8'));
const COST = { feeRate: 0.001, slipRate: 0.0005 };
const NO_FUNDING = { start: 40, fundingOff: true };
// A tighter staircase than the live defaults so that 300 4h bars contain several cycles
const P = { ...CYCLE_DEFAULTS, minNotional: 25, dropPct: 0.01, ratioPct: 0.3, capUsd: 300, exitPct: 0.005 };

// ---- Staircase cycle (family "cycle") ----

test('staircase: completes cycles on real BTC 4h bars', () => {
  const r = runCycle(bars, P, COST, NO_FUNDING);
  assert.ok(r.cycle.cycles >= 1, `expected at least one finished cycle, got ${r.cycle.cycles}`);
  assert.equal(r.equity.length, bars.length);
  assert.ok(Number.isFinite(r.totalReturn));
});

test('staircase: never holds more than the cap', () => {
  for (const cap of [60, 120, 300]) {
    const r = runCycle(bars, { ...P, capUsd: cap }, COST, NO_FUNDING);
    assert.ok(r.cycle.maxInvested <= cap + 1e-9, `cap ${cap}: held ${r.cycle.maxInvested}`);
  }
});

test('staircase: every finished cycle reached its profit target (after fees)', () => {
  const r = runCycle(bars, P, COST, NO_FUNDING);
  for (const c of r.trades) assert.ok(c.pnl > 0, `cycle closed at a loss: ${JSON.stringify(c)}`);
});

test('staircase: no look-ahead — adding future bars does not change past cycles', () => {
  const cut = 200;
  const early = runCycle(bars.slice(0, cut), P, COST, NO_FUNDING);
  const full = runCycle(bars, P, COST, NO_FUNDING);
  const closedEarly = early.trades.filter((c) => c.closeTime <= bars[cut - 1].time);
  assert.deepEqual(full.trades.slice(0, closedEarly.length), closedEarly);
  assert.deepEqual(full.equity.slice(0, cut - 1), early.equity.slice(0, cut - 1));
});

test('staircase: short side mirrors the long side (different results, same bookkeeping)', () => {
  const long = runCycle(bars, P, COST, NO_FUNDING), short = runCycle(bars, { ...P, side: 'short' }, COST, NO_FUNDING);
  assert.equal(short.cycle.side, 'short');
  assert.notDeepEqual(long.trades, short.trades);
  assert.ok(short.cycle.maxInvested <= P.capUsd + 1e-9);
});

test('staircase: same input gives the same output', () => {
  assert.equal(JSON.stringify(runCycle(bars, P, COST, NO_FUNDING)), JSON.stringify(runCycle(structuredClone(bars), P, COST, NO_FUNDING)));
});

// ---- Rule spec (what "build a strategy" produces) ----

const goldenCross = {
  family: 'signal',
  indicators: { ma: { kind: 'sma', params: { fast: 20, slow: 60 } } },
  entry: { op: 'crossUp', a: { ind: 'ma', out: 'fast' }, b: { ind: 'ma', out: 'slow' } },
  exit: { op: 'crossDown', a: { ind: 'ma', out: 'fast' }, b: { ind: 'ma', out: 'slow' } },
};

test('spec: a golden-cross rule validates and runs', () => {
  validateSpec(goldenCross);
  const r = fromSpec(goldenCross).run(bars, {}, DEFAULT_ASSUMPTIONS);
  assert.equal(r.equity.length, bars.length);
  assert.ok(Number.isFinite(r.totalReturn));
});

test('spec: trades fill on the NEXT bar open, never on the signal bar', () => {
  const r = fromSpec(goldenCross).run(bars, {}, DEFAULT_ASSUMPTIONS);
  assert.ok((r.marks ?? []).length >= 1, 'expected at least one fill on 300 bars');
  for (const m of r.marks ?? []) {
    const bar = bars[m.i];
    assert.ok(Math.abs(m.price / bar.open - 1) < 0.002, `fill ${m.price} is not near bar open ${bar.open}`);
  }
});

test('spec: bad rules are rejected with a reason', () => {
  assert.throws(() => validateSpec({ family: 'nope' }), SpecError);
  assert.throws(() => validateSpec({ family: 'cycle', params: { dropPct: 5 } }), SpecError);   // 500% step is out of range
  assert.throws(() => validateSpec({ family: 'cycle', params: {}, entry: {} }), SpecError);   // cycle has fixed timing
  assert.throws(() => validateSpec({ ...goldenCross, indicators: { ma: { kind: 'no-such-indicator' } } }), SpecError);
});
