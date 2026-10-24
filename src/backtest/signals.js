// 지표 기반 전략군.
// indicators.js(cb095dd 원본)를 그대로 쓴다 — 화면의 지표와 백테스트의 지표가 같은 코드여야 한다.
import { runIndicator, Indicators } from '../indicators.js';
import { Account, DEFAULT_ASSUMPTIONS, finish } from './engine.js';
import { computeIndicator } from './htf.js';

/**
 * 신호형 전략 공통 러너. 롱 온리, 전량 진입/청산.
 * 봉 종가 신호 → 다음 봉 시가 체결 (같은 봉 종가 체결은 미래를 보는 것이다).
 */
export function runSignal(candles, p, a, def) {
  const acc = new Account(a.seed, a);
  const ind = {};
  for (const [name, spec] of Object.entries(def.indicators(p))) {
    ind[name] = computeIndicator(candles, spec);   // spec.tf 가 있으면 큰 봉에서 계산 (htf.js)
  }

  const equity = [], trades = [], marks = [];
  let inPos = false, entryCost = 0, entryIndex = 0, entryPx = 0, pending = null, ruinedAt = -1;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    // 전 봉의 신호를 이번 봉 시가에 체결
    if (pending === 'buy' && !inPos) {
      const f = acc.buy(c.open, acc.cash / (1 + a.feeRate));
      if (f) { inPos = true; entryCost = f.cost; entryIndex = i; entryPx = f.px; marks.push({ i, time: c.time, side: 'buy', price: f.px }); }
    } else if (pending === 'sell' && inPos) {
      const s = acc.sellAll(c.open);
      trades.push({
        openIndex: entryIndex, closeIndex: i,
        openTime: candles[entryIndex].time, closeTime: c.time, time: c.time,
        entryPrice: entryPx, exitPrice: s.px, notional: entryCost,
        bars: i - entryIndex, pnl: s.net - entryCost,
      });
      marks.push({ i, time: c.time, side: 'sell', price: s.px });
      inPos = false; entryCost = 0;
    }
    pending = null;

    // 보유 중 정보도 넘긴다 — 익절/손절/보유기간 규칙은 이게 없으면 표현할 수 없다.
    // 기존 전략들은 이 필드를 쓰지 않으므로 숫자가 바뀌지 않는다 (테스트가 대조한다).
    const sig = def.signal({
      candles, c, i, ind, p, inPos,
      entryPrice: inPos ? entryPx : null,
      entryIndex: inPos ? entryIndex : -1,
      barsHeld: inPos ? i - entryIndex : 0,
    });
    if (sig === 'buy' && !inPos) pending = 'buy';
    else if (sig === 'sell' && inPos) pending = 'sell';

    const eq = acc.equity(c.close);
    equity.push(eq);
    if (ruinedAt < 0 && eq <= acc.seed * a.ruinThreshold) { ruinedAt = i; break; }
  }
  while (equity.length < candles.length) equity.push(equity.at(-1) ?? acc.seed);

  return finish(acc, candles, equity, trades, ruinedAt, marks, {
    baseNotional: a.seed,
    exposureShare: candles.length ? trades.reduce((s, t) => s + t.bars, 0) / candles.length : 0,
    openPosition: inPos,
    series: ind,
  });
}

function make(def) {
  // 지표 파라미터 이름이 실제 스키마와 다르면 normalizeParams 가 조용히 기본값으로 떨어진다.
  // 그러면 파라미터 스윕이 전부 같은 값을 내놓는다 — 실제로 한 번 당했다. 여기서 막는다.
  const probe = def.indicators(def.defaults);
  for (const [slot, spec] of Object.entries(probe)) {
    const schema = Indicators[spec.key];
    if (!schema) throw new Error(`[${def.key}] 없는 지표: ${spec.key}`);
    const allowed = new Set((schema.inputs || []).map((i) => i.name));
    for (const name of Object.keys(spec.params || {})) {
      if (!allowed.has(name)) {
        throw new Error(`[${def.key}] ${spec.key}.${slot} 파라미터 '${name}' 은 스키마에 없다. 가능: ${[...allowed].join(', ')}`);
      }
    }
  }
  return {
    key: def.key, name: def.name, family: 'signal',
    defaults: def.defaults, sweep: def.sweep, plot: def.plot, blurb: def.blurb,
    indicators: def.indicators,
    run: (candles, p, a = DEFAULT_ASSUMPTIONS) => runSignal(candles, p, a, def),
  };
}

const x = (arr, i) => (Array.isArray(arr) ? arr[i] : null);
const num = (v) => (v && typeof v === 'object' ? v.value : v);
const cross = (a, b, i) =>
  i > 0 && Number.isFinite(a[i]) && Number.isFinite(b[i]) && Number.isFinite(a[i - 1]) && Number.isFinite(b[i - 1])
    ? (a[i - 1] <= b[i - 1] && a[i] > b[i] ? 'up' : a[i - 1] >= b[i - 1] && a[i] < b[i] ? 'down' : null)
    : null;

// ─────────────────────────── 이동평균 교차 (골든/데드 크로스)

export const maCross = make({
  key: 'ma-cross', name: 'MA Cross',
  blurb: 'Golden cross in, death cross out. The strategy everyone has heard of.',
  defaults: { fast: 20, slow: 60 },
  sweep: { fast: [5, 10, 20, 50], slow: [50, 100, 150, 200] },
  indicators: (p) => ({ ma: { key: 'sma', params: { fast: p.fast, slow: p.slow } } }),
  plot: [{ source: 'ma', output: 'fast', pane: 'price', color: '#60a5fa', label: 'fast' },
         { source: 'ma', output: 'slow', pane: 'price', color: '#f59e0b', label: 'slow' }],
  signal: ({ ind, i }) => {
    const d = cross(ind.ma.fast, ind.ma.slow, i);
    return d === 'up' ? 'buy' : d === 'down' ? 'sell' : null;
  },
});

export const emaCross = make({
  key: 'ema-cross', name: 'EMA Cross',
  blurb: 'Same idea as MA Cross but exponentially weighted — reacts faster, whipsaws more.',
  defaults: { fast: 12, slow: 26 },
  sweep: { fast: [5, 9, 12, 21], slow: [26, 50, 100, 200] },
  indicators: (p) => ({ ma: { key: 'ema', params: { fast: p.fast, slow: p.slow } } }),
  plot: [{ source: 'ma', output: 'fast', pane: 'price', color: '#60a5fa', label: 'fast' },
         { source: 'ma', output: 'slow', pane: 'price', color: '#f59e0b', label: 'slow' }],
  signal: ({ ind, i }) => {
    const d = cross(ind.ma.fast, ind.ma.slow, i);
    return d === 'up' ? 'buy' : d === 'down' ? 'sell' : null;
  },
});

// ─────────────────────────── RSI 평균회귀

export const rsiReversion = make({
  key: 'rsi-reversion', name: 'RSI Reversion',
  blurb: 'Buy oversold, sell overbought. Works in ranges, gets run over by trends.',
  defaults: { length: 14, buyBelow: 30, sellAbove: 70 },
  sweep: { buyBelow: [20, 25, 30, 35], sellAbove: [60, 65, 70, 80] },
  indicators: (p) => ({ rsi: { key: 'rsi', params: { length: p.length, ma: 9 } } }),
  plot: [{ source: 'rsi', output: 'value', pane: 'sub', color: '#a78bfa', label: 'RSI', bands: [30, 70] }],
  signal: ({ ind, i, p, inPos }) => {
    const v = ind.rsi.value[i];
    if (!Number.isFinite(v)) return null;
    if (!inPos && v < p.buyBelow) return 'buy';
    if (inPos && v > p.sellAbove) return 'sell';
    return null;
  },
});

// ─────────────────────────── MACD 히스토그램 전환

export const macdCross = make({
  key: 'macd-cross', name: 'MACD Cross',
  blurb: 'Enter when the histogram turns positive, exit when it turns negative.',
  defaults: { fast: 12, slow: 26, signal: 9 },
  sweep: { fast: [8, 12, 16, 20], slow: [21, 26, 34, 50] },
  indicators: (p) => ({ macd: { key: 'macd', params: { fast: p.fast, slow: p.slow, signal: p.signal } } }),
  plot: [{ source: 'macd', output: 'histogram', pane: 'sub', color: '#34d399', label: 'MACD hist', bands: [0] }],
  signal: ({ ind, i }) => {
    const h = ind.macd.histogram;
    if (i === 0 || !Number.isFinite(h[i]) || !Number.isFinite(h[i - 1])) return null;
    if (h[i - 1] <= 0 && h[i] > 0) return 'buy';
    if (h[i - 1] >= 0 && h[i] < 0) return 'sell';
    return null;
  },
});

// ─────────────────────────── 볼린저 밴드 반전

export const bbReversion = make({
  key: 'bb-reversion', name: 'Bollinger Reversion',
  blurb: 'Buy the lower band, sell back at the mean. A range trade with an ugly tail risk.',
  defaults: { length: 20, mult: 2 },
  sweep: { length: [10, 20, 30, 50], mult: [1.5, 2, 2.5, 3] },
  indicators: (p) => ({ bb: { key: 'bb', params: { length: p.length, mult: p.mult } } }),
  plot: [{ source: 'bb', output: 'upper', pane: 'price', color: '#64748b', label: 'upper' },
         { source: 'bb', output: 'basis', pane: 'price', color: '#f59e0b', label: 'basis' },
         { source: 'bb', output: 'lower', pane: 'price', color: '#64748b', label: 'lower' }],
  signal: ({ ind, c, i, inPos }) => {
    const lo = ind.bb.lower[i], mid = ind.bb.basis[i];
    if (!Number.isFinite(lo) || !Number.isFinite(mid)) return null;
    if (!inPos && c.close <= lo) return 'buy';
    if (inPos && c.close >= mid) return 'sell';
    return null;
  },
});

// ─────────────────────────── 돈치안 돌파 (터틀)

export const donchianBreakout = make({
  key: 'donchian-breakout', name: 'Donchian Breakout',
  blurb: 'The Turtle rule: buy the N-day high, exit the N-day low. Pure trend following.',
  defaults: { length: 20 },
  sweep: { length: [10, 20, 55, 100] },
  indicators: (p) => ({ dc: { key: 'donchian', params: { length: p.length } } }),
  plot: [{ source: 'dc', output: 'upper', pane: 'price', color: '#22c55e', label: 'upper' },
         { source: 'dc', output: 'lower', pane: 'price', color: '#ef4444', label: 'lower' }],
  signal: ({ ind, c, i, inPos }) => {
    const up = ind.dc.upper[i - 1], lo = ind.dc.lower[i - 1];
    if (!Number.isFinite(up) || !Number.isFinite(lo)) return null;
    if (!inPos && c.close >= up) return 'buy';
    if (inPos && c.close <= lo) return 'sell';
    return null;
  },
});

// ─────────────────────────── 슈퍼트렌드 추종

export const supertrendFollow = make({
  key: 'supertrend', name: 'Supertrend',
  blurb: 'Follow the ATR trailing band. Few trades, long holds, brutal in chop.',
  defaults: { length: 10, mult: 3 },
  sweep: { length: [7, 10, 14, 21], mult: [2, 2.5, 3, 4] },
  indicators: (p) => ({ st: { key: 'supertrend', params: { length: p.length, mult: p.mult } } }),
  plot: [{ source: 'st', output: 'line', pane: 'price', color: '#22c55e', label: 'Supertrend' }],
  signal: ({ ind, c, i, inPos }) => {
    const v = num(x(ind.st.line, i));
    if (!Number.isFinite(v)) return null;
    if (!inPos && c.close > v) return 'buy';
    if (inPos && c.close < v) return 'sell';
    return null;
  },
});

// ─────────────────────────── 스토캐스틱 교차

export const stochCross = make({
  key: 'stoch-cross', name: 'Stochastic Cross',
  blurb: '%K crossing %D in oversold territory. Classic momentum timing.',
  defaults: { k: 14, d: 3, smoothK: 1, buyBelow: 25 },
  sweep: { k: [9, 14, 21, 30], buyBelow: [15, 20, 25, 35] },
  indicators: (p) => ({ st: { key: 'stoch', params: { k: p.k, d: p.d, smoothK: p.smoothK } } }),
  plot: [{ source: 'st', output: 'k', pane: 'sub', color: '#60a5fa', label: '%K', bands: [20, 80] },
         { source: 'st', output: 'd', pane: 'sub', color: '#f59e0b', label: '%D' }],
  signal: ({ ind, i, p, inPos }) => {
    const d = cross(ind.st.k, ind.st.d, i);
    const k = ind.st.k[i];
    if (!Number.isFinite(k)) return null;
    if (!inPos && d === 'up' && k < p.buyBelow + 25) return 'buy';
    if (inPos && d === 'down' && k > 70) return 'sell';
    return null;
  },
});

// ─────────────────────────── SAR 전환

export const sarFlip = make({
  key: 'sar-flip', name: 'Parabolic SAR',
  blurb: 'Flip with the parabolic stop. Always in or out, never neutral for long.',
  defaults: { step: 0.02, max: 0.2 },
  sweep: { step: [0.01, 0.02, 0.03, 0.05], max: [0.1, 0.2, 0.3, 0.5] },
  indicators: (p) => ({ sar: { key: 'sar', params: { step: p.step, max: p.max } } }),
  plot: [{ source: 'sar', output: 'value', pane: 'price', color: '#a78bfa', label: 'SAR' }],
  // SAR 은 정의상 "내일 걸어둘 스톱"이다 — indicators.js 의 sar[i] 는 candles[i] 의 고저까지
  // 반영해 계산되므로, 그 값은 i 봉이 아니라 i+1 봉에 유효하다. 그래서 한 봉 밀어서 쓴다.
  // (sar[i] 를 그대로 쓰면 미래를 보는 것은 아니지만, 그 봉을 만든 값으로 그 봉을 판정하게 된다)
  signal: ({ ind, c, i, inPos }) => {
    const v = ind.sar.value[i - 1];
    if (!Number.isFinite(v)) return null;
    if (!inPos && c.close > v) return 'buy';
    if (inPos && c.close < v) return 'sell';
    return null;
  },
});

export const SIGNAL_STRATEGIES = {
  'ma-cross': maCross,
  'ema-cross': emaCross,
  'rsi-reversion': rsiReversion,
  'macd-cross': macdCross,
  'bb-reversion': bbReversion,
  'donchian-breakout': donchianBreakout,
  'supertrend': supertrendFollow,
  'stoch-cross': stochCross,
  'sar-flip': sarFlip,
};
