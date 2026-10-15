// Chart pattern detector — rule-based and deterministic.
// Fixture: Binance BTC/USDT 4h, 300 closed bars ending 2026-10-14 20:00 UTC (public market data).
// Run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findPatterns, zigzag, PATTERN_KINDS, PATTERN_BIAS } from '../src/patterns.js';

const bars = JSON.parse(readFileSync(new URL('./fixtures/btcusdt-4h.json', import.meta.url), 'utf8'));
const STEP_4H = 4 * 3600;

test('finds the symmetrical triangle on BTC/USDT 4h (as shown on the site)', () => {
  const found = findPatterns(bars, { step: STEP_4H });
  const tri = found.find((p) => p.kind === 'tri_sym');
  assert.ok(tri, 'symmetrical triangle expected');
  assert.equal(tri.status, 'forming');
  assert.equal(tri.agree, 3, 'all three sensitivity levels agree');
  assert.ok(tri.levels.up > tri.levels.down, 'upper line above lower line');
  assert.ok(tri.levels.target_up > tri.levels.up && tri.levels.target_down < tri.levels.down, 'targets sit outside the lines');
});

test('same input gives the same output — no randomness, no AI', () => {
  const a = JSON.stringify(findPatterns(bars, { step: STEP_4H }));
  const b = JSON.stringify(findPatterns(structuredClone(bars), { step: STEP_4H }));
  assert.equal(a, b);
});

test('every result is well-formed', () => {
  for (const p of findPatterns(bars, { step: STEP_4H, max: 10 })) {
    assert.ok(PATTERN_KINDS.includes(p.kind));
    assert.equal(p.bias, PATTERN_BIAS[p.kind]);
    assert.ok(p.score >= 0 && p.score <= 100);
    assert.ok(p.i0 < p.i1 && p.i1 <= bars.length - 1 + 60);
  }
});

test('zigzag alternates highs and lows', () => {
  const piv = zigzag(bars, 2.3);
  assert.ok(piv.length >= 4);
  for (let i = 1; i < piv.length; i++) assert.notEqual(piv[i].type, piv[i - 1].type);
});

test('too few bars → no patterns (does not guess)', () => {
  assert.deepEqual(findPatterns(bars.slice(0, 40), { step: STEP_4H }), []);
});
