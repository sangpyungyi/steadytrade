// 전략 규칙 스키마.
//
// 사용자가 말로 설명한 전략은 이 형식으로 옮겨진 뒤에야 실행된다.
// 형식이 좁을수록 "옮길 수 없음"이 늘고, 넓을수록 아무 코드나 실행하는 셈이 된다.
// 그래서 출발점은 **지금 있는 전략들이 실제로 쓰는 문법**으로 잡았다.
// 그 밖은 정직하게 "아직 못 옮깁니다"로 답한다.
//
// 표현식은 튜링 완전하지 않다. 함수도 반복도 없고 아래 노드만 있다.

import { Indicators } from '../indicators.js';

const PRICES = new Set(['open', 'high', 'low', 'close', 'volume']);
// 보유 중일 때만 값이 있는 것들. 익절·손절·보유기간은 이게 없으면 표현할 수 없고,
// 사람이 말로 설명하는 전략은 대부분 이걸 포함한다.
const POS = new Set(['entryPrice', 'gainPct', 'bars']);
const CMP = { lt: (a, b) => a < b, lte: (a, b) => a <= b, gt: (a, b) => a > b, gte: (a, b) => a >= b };
const CROSS = new Set(['crossUp', 'crossDown']);

/** supertrend 처럼 {value,color} 를 내는 출력을 숫자로 편다 */
const num = (v) => (v && typeof v === 'object' ? v.value : v);

export class SpecError extends Error {
  constructor(msg, path) { super(path ? `${path}: ${msg}` : msg); this.path = path ?? null; }
}

const outputsOf = (kind) => (Indicators[kind].outputs || []).map((o) => (typeof o === 'string' ? o : o.name));

// ─────────────────────────────────────────── 검증

function checkValue(v, inds, path, { allowPos }) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new SpecError('값 노드가 아니다', path);
  const back = v.back ?? 0;
  if (!Number.isInteger(back) || back < 0 || back > 50) throw new SpecError('back 은 0~50 정수여야 한다', path);
  if ('lowest' in v || 'highest' in v) {
    // 최근 N봉의 최저/최고 (10-09) — 다이버전스·돌파 같은 규칙: {"lowest": <값>, "bars": 20, "back": 1}
    const inner = v.lowest ?? v.highest;
    if (!Number.isInteger(v.bars) || v.bars < 2 || v.bars > 500) throw new SpecError('bars 는 2~500 정수여야 한다', path);
    if (inner && typeof inner === 'object' && 'pos' in inner) throw new SpecError('lowest/highest 안에는 pos 를 쓸 수 없다', path);
    checkValue(inner, inds, `${path}.${'lowest' in v ? 'lowest' : 'highest'}`, { allowPos: false });
    return;
  }
  if ('const' in v) {
    if (!Number.isFinite(v.const)) throw new SpecError('const 는 유한한 수여야 한다', path);
  } else if ('price' in v) {
    if (!PRICES.has(v.price)) throw new SpecError(`price 는 ${[...PRICES].join(' | ')} 중 하나`, path);
  } else if ('pos' in v) {
    if (!POS.has(v.pos)) throw new SpecError(`pos 는 ${[...POS].join(' | ')} 중 하나`, path);
    // 보유 중이 아니면 값이 없다. 진입 조건에 쓰면 영원히 거짓인 규칙이 되므로 막는다.
    if (!allowPos) throw new SpecError('pos 는 청산 조건에서만 쓸 수 있다 (보유 중에만 값이 있다)', path);
    if (back !== 0) throw new SpecError('pos 에는 back 을 쓸 수 없다', path);
  } else if ('ind' in v) {
    const d = inds[v.ind];
    if (!d) throw new SpecError(`선언되지 않은 지표 '${v.ind}'`, path);
    const outs = outputsOf(d.kind);
    if (!outs.includes(v.out)) throw new SpecError(`'${d.kind}' 의 출력이 아니다: '${v.out}' (가능: ${outs.join(', ')})`, path);
  } else {
    throw new SpecError('const · price · pos · ind 중 하나여야 한다', path);
  }
}

function checkCond(c, inds, path, opt) {
  if (!c || typeof c !== 'object') throw new SpecError('조건 노드가 아니다', path);
  if (c.op === 'and' || c.op === 'or') {
    if (!Array.isArray(c.of) || c.of.length < 2 || c.of.length > 6) throw new SpecError('of 는 2~6개', path);
    c.of.forEach((x, i) => checkCond(x, inds, `${path}.of[${i}]`, opt));
    return;
  }
  if (c.op === 'not') { checkCond(c.of, inds, `${path}.of`, opt); return; }
  if (c.op in CMP || CROSS.has(c.op)) {
    checkValue(c.a, inds, `${path}.a`, opt);
    checkValue(c.b, inds, `${path}.b`, opt);
    if (c.pct !== undefined && !(Number.isFinite(c.pct) && Math.abs(c.pct) < 10)) throw new SpecError('pct 가 범위 밖', path);
    return;
  }
  throw new SpecError(`모르는 연산 '${c.op}' (가능: ${[...Object.keys(CMP), ...CROSS, 'and', 'or', 'not'].join(', ')})`, path);
}

/** 통과하지 못하면 실행하지 않는다 — 그게 이 층의 존재 이유다. */
export function validateSpec(spec) {
  if (!spec || typeof spec !== 'object') throw new SpecError('스펙이 객체가 아니다');
  if (!['signal', 'scaleIn', 'grid', 'periodic', 'once', 'cycle'].includes(spec.family)) {
    throw new SpecError(`모르는 계열 '${spec.family}' (가능: signal, scaleIn, grid, periodic, once, cycle)`, 'family');
  }
  // 계단식 순환매매 (10-23 backtest/cycle.js) — 규칙이 정해져 있어 지표·조건을 받지 않는다. 값 범위만 본다
  if (spec.family === 'cycle') {
    for (const k of ['indicators', 'entry', 'exit', 'add', 'filter', 'shortEntry', 'shortExit']) if (spec[k] !== undefined) throw new SpecError(`cycle 계열에는 ${k} 를 쓰지 않는다`, k);
    const p = spec.params ?? {};
    if (p.side !== undefined && !['long', 'short'].includes(p.side)) throw new SpecError('params.side 는 long 또는 short', 'cycle');
    if (p.htf !== undefined && !['auto', '4h', '1d', 'off'].includes(p.htf)) throw new SpecError('params.htf 는 auto, 4h, 1d, off 중 하나', 'cycle');
    if (p.cover !== undefined && typeof p.cover !== 'boolean') throw new SpecError('params.cover 는 참·거짓', 'cycle');
    for (const [k, [lo, hi]] of Object.entries(CYCLE_LIMITS)) {
      const v = p[k];
      if (v === undefined) continue;
      if (!Number.isFinite(v) || v < lo || v > hi) throw new SpecError(`params.${k} 가 범위 밖이다: ${v} (${lo} ~ ${hi}) — 비율은 분수(0.012 = 1.2%)`, 'cycle');
    }
    return {};
  }

  const inds = {};
  const entries = Object.entries(spec.indicators ?? {});
  if (entries.length > 4) throw new SpecError('지표는 4개까지', 'indicators');
  for (const [id, d] of entries) {
    if (!/^[a-z][a-z0-9_]{0,15}$/i.test(id)) throw new SpecError('지표 id 는 영문자로 시작하는 16자 이내', `indicators.${id}`);
    if (!d || !Indicators[d.kind]) throw new SpecError(`없는 지표 '${d?.kind}'`, `indicators.${id}`);
    // 큰 봉 지표 (10-08): 1시간봉으로 돌리면서 4시간봉 MACD 를 조건에 쓰는 식 — 이미 닫힌 큰 봉만 본다 (backtest/htf.js)
    if (d.tf !== undefined && !['1h', '4h', '1d'].includes(d.tf)) throw new SpecError(`지표 tf 는 1h, 4h, 1d 중 하나 (받은 것: ${d.tf})`, `indicators.${id}`);
    const allowed = new Set((Indicators[d.kind].inputs || []).map((i) => i.name));
    for (const k of Object.keys(d.params ?? {})) {
      if (!allowed.has(k)) throw new SpecError(`'${d.kind}' 의 파라미터가 아니다: '${k}' (가능: ${[...allowed].join(', ')})`, `indicators.${id}`);
    }
    inds[id] = d;
  }

  if (spec.family === 'signal') {
    // 롱(entry/exit)·숏(shortEntry/shortExit) 중 하나 이상 (10-09 — 숏·레버리지는 backtest/position.js)
    if (!spec.entry && !spec.shortEntry) throw new SpecError('entry 또는 shortEntry 가 필요하다');
    const riskExit = spec.stopPct !== undefined || spec.takePct !== undefined;
    if (spec.entry) { checkCond(spec.entry, inds, 'entry', { allowPos: false }); if (spec.exit || !riskExit) checkCond(spec.exit, inds, 'exit', { allowPos: true }); }
    else if (spec.exit) throw new SpecError('exit 는 entry 와 같이 쓴다');
    if (spec.shortEntry) { checkCond(spec.shortEntry, inds, 'shortEntry', { allowPos: false }); if (spec.shortExit || !riskExit) checkCond(spec.shortExit, inds, 'shortExit', { allowPos: true }); }
    else if (spec.shortExit) throw new SpecError('shortExit 는 shortEntry 와 같이 쓴다');
    for (const [k, [lo, hi]] of Object.entries(POSITION_LIMITS)) {
      if (spec[k] === undefined) continue;
      if (!Number.isFinite(spec[k]) || spec[k] < lo || spec[k] > hi) throw new SpecError(`${k} 가 범위 밖이다: ${spec[k]} (${lo} ~ ${hi}) — 비율은 분수(0.05 = 5%)`, k);
    }
  } else {
    if (spec.exit) throw new SpecError(`${spec.family} 계열에는 exit 를 쓰지 않는다 — scaleIn 은 takeProfitPct·takeFraction 으로 판다`);
    // 조건:
    //   filter: 참일 때만 산다 — scaleIn 은 새 사이클·물타기, grid 는 새 칸 매수, periodic 은 정기 매수 (10-08 scaleIn · 10-22 grid·periodic).
    //           파는 쪽(익절·그리드 매도)은 늘 한다
    //   entry : 새 사이클 첫 매수 시점 (예: 종가가 이평 상향 돌파) · add: 추가매수 시점 (dropPct 아래 + 이 조건) (10-09) — scaleIn 만
    for (const k of ['filter', 'entry', 'add']) {
      if (spec[k] === undefined) continue;
      if (k === 'filter' ? !['scaleIn', 'grid', 'periodic'].includes(spec.family) : spec.family !== 'scaleIn') throw new SpecError(`${k} 는 ${k === 'filter' ? 'scaleIn·grid·periodic' : 'scaleIn'} 계열만 쓴다`, k);
      checkCond(spec[k], inds, k, { allowPos: false });
    }
    const need = PARAM_LIMITS[spec.family];
    for (const [k, [lo, hi, int]] of Object.entries(need)) {
      const v = spec.params?.[k];
      // 빠진 값은 계열 기본값으로 채운다 (run.js) — 무엇을 채웠는지는 defaultedParams() 로 알려 준다
      if (v === undefined) continue;
      if (!Number.isFinite(v)) throw new SpecError(`params.${k} 는 숫자여야 한다`, spec.family);
      // 범위를 안 보면 "5% 하락" 이 5.0 (= 500%) 으로 들어와도 그대로 돈다.
      // 그렇게 나온 숫자는 제출자의 전략에 대한 정보가 아니다.
      if (v < lo || v > hi) throw new SpecError(`params.${k} 가 범위 밖이다: ${v} (${lo} ~ ${hi})`, spec.family);
      if (int && !Number.isInteger(v)) throw new SpecError(`params.${k} 는 정수여야 한다: ${v}`, spec.family);
    }
  }
  return inds;
}

/** 신호형의 선물 옵션 [최소, 최대] — 비율은 분수 */
export const POSITION_LIMITS = { leverage: [1, 20], sizePct: [0.05, 1], stopPct: [0.002, 0.9], takePct: [0.002, 5], fundingPct8h: [0, 0.01] };
/** 이 스펙은 숏·레버리지 실행기가 필요한가 (아니면 예전 롱 전용 실행기 — 숫자가 바뀌지 않게) */
export const needsPosition = (spec) => spec?.family === 'signal' && !!(spec.shortEntry || (spec.leverage ?? 1) > 1 || spec.stopPct !== undefined || spec.takePct !== undefined || spec.fundingPct8h !== undefined || (spec.sizePct ?? 1) !== 1);

/** 스펙에서 빠져 기본값으로 채운 파라미터 이름들 */
export const defaultedParams = (spec) => Object.keys(PARAM_LIMITS[spec?.family] ?? {}).filter((k) => !OPTIONAL_PARAMS.has(k) && spec?.params?.[k] === undefined);
/** 빠져도 "기본값으로 채움" 이라 알리지 않는 선택 항목 (빠지면 예전 동작 그대로) */
const OPTIONAL_PARAMS = new Set(['takeFraction', 'runnerTakePct']);

/** 계단식 순환매매 [최소, 최대] — 금액은 달러, 비율은 분수 (10-23) */
export const CYCLE_LIMITS = { minNotional: [10, 1e6], dropPct: [0.0005, 0.5], ratioPct: [0.01, 3], capUsd: [10, 1e8], exitPct: [0.0001, 0.5], coverMinLossPct: [0.001, 0.9] };

/** [최소, 최대, 정수여야 함] — 비율은 전부 분수다 (0.05 = 5%) */
export const PARAM_LIMITS = {
  scaleIn: {
    basePct: [0.001, 0.5], dropPct: [0.005, 0.5], multiplier: [1, 5],
    takeProfitPct: [0.002, 1], maxSteps: [1, 20, true],
    // 일부 청산 (10-09): 익절가에서 takeFraction 만 팔고 나머지는 runnerTakePct 또는 평균가(본전)에서
    takeFraction: [0.1, 1], runnerTakePct: [0.002, 5],
  },
  grid: { rangePct: [0.02, 2], levels: [2, 60, true], allocPct: [0.002, 0.5] },
  periodic: { intervalBars: [1, 365, true], amountPct: [0.001, 0.5] },
  once: {},
};

// ─────────────────────────────────────────── 평가
// ind 는 runSignal 이 봉 전체에 대해 미리 계산해 넘겨준다. 여기서 다시 계산하지 않는다.

function readValue(v, i, candles, ind, pos) {
  if ('pos' in v) {
    if (!pos || !pos.inPos) return null;
    if (v.pos === 'entryPrice') return pos.entryPrice;
    if (v.pos === 'bars') return pos.barsHeld;
    // gainPct 는 종가 기준 미실현 손익률. 체결은 다음 봉 시가라 실제 실현값과는 조금 다르다 —
    // 이 사이트의 다른 모든 신호와 같은 규약이다.
    // 숏(side -1)은 내리면 이익 — 롱 전용 실행기는 side 를 넘기지 않아 예전과 같다
    return pos.entryPrice ? ((candles[i].close - pos.entryPrice) / pos.entryPrice) * (pos.side === -1 ? -1 : 1) : null;
  }
  const j = i - (v.back ?? 0);
  if (j < 0) return null;
  if ('lowest' in v || 'highest' in v) {
    const inner = v.lowest ?? v.highest, lo = 'lowest' in v;
    if (j - v.bars + 1 < 0) return null;
    let best = null;
    for (let k = j - v.bars + 1; k <= j; k++) {
      const x = readValue(inner, k, candles, ind, null);
      if (x == null || !Number.isFinite(x)) continue;
      if (best == null || (lo ? x < best : x > best)) best = x;
    }
    return best;
  }
  if ('const' in v) return v.const;
  if ('price' in v) return candles[j]?.[v.price] ?? null;
  const arr = ind[v.ind]?.[v.out];
  return arr ? num(arr[j]) : null;
}

const finite = (x) => x !== null && x !== undefined && Number.isFinite(x);

export function evalCond(c, i, candles, ind, pos) {
  if (c.op === 'and') { for (const x of c.of) if (!evalCond(x, i, candles, ind, pos)) return false; return true; }
  if (c.op === 'or') { for (const x of c.of) if (evalCond(x, i, candles, ind, pos)) return true; return false; }
  if (c.op === 'not') return !evalCond(c.of, i, candles, ind, pos);

  const a = readValue(c.a, i, candles, ind, pos);
  let b = readValue(c.b, i, candles, ind, pos);
  if (!finite(a) || !finite(b)) return false;
  if (c.pct !== undefined) b *= (1 + c.pct);

  if (c.op in CMP) return CMP[c.op](a, b);

  // 교차는 직전 봉과 비교한다. pos 값은 back 을 못 쓰므로 교차에 쓰면 직전 값이 없다 —
  // readValue 가 null 을 주고 아래에서 거짓이 된다.
  const a0 = 'pos' in c.a ? null : readValue({ ...c.a, back: (c.a.back ?? 0) + 1 }, i, candles, ind, pos);
  let b0 = 'pos' in c.b ? null : readValue({ ...c.b, back: (c.b.back ?? 0) + 1 }, i, candles, ind, pos);
  if (!finite(a0) || !finite(b0)) return false;
  if (c.pct !== undefined) b0 *= (1 + c.pct);
  return c.op === 'crossUp' ? (a0 <= b0 && a > b) : (a0 >= b0 && a < b);
}

/**
 * 스펙 → signals.js 의 signal 전략 정의.
 * 종가에서 판정하고 다음 봉 시가에 체결하는 규약은 runSignal 이 그대로 쓴다.
 */
export function compileSignal(spec, { key = 'submitted', name = 'Submitted strategy' } = {}) {
  validateSpec(spec);
  if (spec.family !== 'signal') throw new SpecError(`compileSignal 은 signal 계열만 받는다 (받은 것: ${spec.family})`);
  return {
    key, name, family: 'submitted', spec,
    blurb: spec.blurb ?? '',
    defaults: {},
    sweep: spec.sweep ?? null,
    plot: spec.plot ?? [],
    indicators: () => Object.fromEntries(
      Object.entries(spec.indicators ?? {}).map(([id, d]) => [id, { key: d.kind, params: d.params ?? {}, tf: d.tf }])),
    signal: ({ candles, i, ind, inPos, entryPrice, barsHeld }) => {
      const pos = { inPos, entryPrice, barsHeld };
      if (!inPos) return evalCond(spec.entry, i, candles, ind, pos) ? 'buy' : null;
      return evalCond(spec.exit, i, candles, ind, pos) ? 'sell' : null;
    },
  };
}

/** 사람이 읽을 수 있는 한 줄로 — 확인 화면에서 쓴다 */
export function describe(node, spec) {
  const v = (x) => {
    const b = x.back ? `[${x.back}봉 전]` : '';
    if ('const' in x) return String(x.const);
    if ('price' in x) return x.price + b;
    if ('pos' in x) return { entryPrice: '진입가', gainPct: '평가손익률', bars: '보유봉수' }[x.pos];
    const d = spec.indicators[x.ind];
    const p = Object.entries(d.params ?? {}).map(([k, val]) => `${k}=${val}`).join(',');
    return `${d.kind}(${p}).${x.out}${b}`;
  };
  const c = node;
  if (c.op === 'and') return c.of.map((x) => describe(x, spec)).join(' 그리고 ');
  if (c.op === 'or') return c.of.map((x) => describe(x, spec)).join(' 또는 ');
  if (c.op === 'not') return `아님(${describe(c.of, spec)})`;
  const pct = c.pct !== undefined ? ` × ${(1 + c.pct).toFixed(4)}` : '';
  const sym = { lt: '<', lte: '≤', gt: '>', gte: '≥', crossUp: '상향돌파', crossDown: '하향돌파' }[c.op];
  return `${v(c.a)} ${sym} ${v(c.b)}${pct}`;
}
