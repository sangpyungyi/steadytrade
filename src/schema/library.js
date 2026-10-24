// 기존 신호형 전략 9종을 스키마로 옮긴 것.
//
// 예시로 쓰려고 만든 게 아니라 **검증**으로 쓴다 —
// 스키마로 표현한 것이 손으로 짠 것과 같은 숫자를 내지 못하면 스키마가 쓸 만하지 않다는 뜻이다.
// (test/schema.test.mjs 가 자산곡선까지 동일한지 본다)
//
// 기본 파라미터 기준으로 옮겼다. 스윕용 변수는 여기 없다 — 스펙은 상수로 굳은 규칙이다.

const price = (p, back) => (back ? { price: p, back } : { price: p });
const ind = (id, out, back) => (back ? { ind: id, out, back } : { ind: id, out });
const k = (n) => ({ const: n });

export const LIBRARY = {
  'ma-cross': {
    family: 'signal',
    indicators: { ma: { kind: 'sma', params: { fast: 20, slow: 60 } } },
    entry: { op: 'crossUp', a: ind('ma', 'fast'), b: ind('ma', 'slow') },
    exit: { op: 'crossDown', a: ind('ma', 'fast'), b: ind('ma', 'slow') },
  },

  'ema-cross': {
    family: 'signal',
    indicators: { ma: { kind: 'ema', params: { fast: 12, slow: 26 } } },
    entry: { op: 'crossUp', a: ind('ma', 'fast'), b: ind('ma', 'slow') },
    exit: { op: 'crossDown', a: ind('ma', 'fast'), b: ind('ma', 'slow') },
  },

  'rsi-reversion': {
    family: 'signal',
    indicators: { rsi: { kind: 'rsi', params: { length: 14, ma: 9 } } },
    entry: { op: 'lt', a: ind('rsi', 'value'), b: k(30) },
    exit: { op: 'gt', a: ind('rsi', 'value'), b: k(70) },
  },

  'macd-cross': {
    family: 'signal',
    indicators: { macd: { kind: 'macd', params: { fast: 12, slow: 26, signal: 9 } } },
    entry: { op: 'crossUp', a: ind('macd', 'histogram'), b: k(0) },
    exit: { op: 'crossDown', a: ind('macd', 'histogram'), b: k(0) },
  },

  'bb-reversion': {
    family: 'signal',
    indicators: { bb: { kind: 'bb', params: { length: 20, mult: 2 } } },
    entry: { op: 'lte', a: price('close'), b: ind('bb', 'lower') },
    exit: { op: 'gte', a: price('close'), b: ind('bb', 'basis') },
  },

  'donchian-breakout': {
    family: 'signal',
    indicators: { dc: { kind: 'donchian', params: { length: 20 } } },
    entry: { op: 'gte', a: price('close'), b: ind('dc', 'upper', 1) },
    exit: { op: 'lte', a: price('close'), b: ind('dc', 'lower', 1) },
  },

  supertrend: {
    family: 'signal',
    indicators: { st: { kind: 'supertrend', params: { length: 10, mult: 3 } } },
    entry: { op: 'gt', a: price('close'), b: ind('st', 'line') },
    exit: { op: 'lt', a: price('close'), b: ind('st', 'line') },
  },

  'stoch-cross': {
    family: 'signal',
    indicators: { st: { kind: 'stoch', params: { k: 14, d: 3, smoothK: 1 } } },
    // 손으로 짠 쪽은 buyBelow(25) + 25 = 50 을 쓴다. 스펙은 계산식이 없으므로 상수로 굳힌다.
    entry: {
      op: 'and',
      of: [
        { op: 'crossUp', a: ind('st', 'k'), b: ind('st', 'd') },
        { op: 'lt', a: ind('st', 'k'), b: k(50) },
      ],
    },
    exit: {
      op: 'and',
      of: [
        { op: 'crossDown', a: ind('st', 'k'), b: ind('st', 'd') },
        { op: 'gt', a: ind('st', 'k'), b: k(70) },
      ],
    },
  },

  'sar-flip': {
    family: 'signal',
    indicators: { sar: { kind: 'sar', params: { step: 0.02, max: 0.2 } } },
    entry: { op: 'gt', a: price('close'), b: ind('sar', 'value', 1) },
    exit: { op: 'lt', a: price('close'), b: ind('sar', 'value', 1) },
  },
};

/** 스키마로는 표현하지 못하는 것들 — 계열만 선언하고 파라미터로 넘긴다 */
export const POSITION_LIBRARY = {
  martingale: { family: 'scaleIn', params: { basePct: 0.02, dropPct: 0.05, multiplier: 2.0, takeProfitPct: 0.03, maxSteps: 10 } },
  grid: { family: 'grid', params: { rangePct: 0.25, levels: 10, allocPct: 0.08 } },
  dca: { family: 'periodic', params: { intervalBars: 7, amountPct: 0.02 } },
  buyhold: { family: 'once', params: {} },
};
