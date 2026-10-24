// 스펙으로 만든 전략을 기존 엔진에 그대로 태운다.
// 새 실행 경로를 만들지 않는 것이 중요하다 — 사용자가 보낸 전략과 교과서 전략이
// 다른 코드로 돌면 "같은 기준으로 쟀다"는 말이 성립하지 않는다.
import { runSignal } from '../backtest/signals.js';
import { STRATEGIES, DEFAULT_ASSUMPTIONS } from '../backtest/engine.js';
import { compileSignal, validateSpec, evalCond, needsPosition, SpecError } from './spec.js';
import { runSpecPosition } from '../backtest/position.js';
import { computeIndicator } from '../backtest/htf.js';

/** signal 계열 스펙 실행 */
export function runSpecStrategy(def, candles, assumptions = DEFAULT_ASSUMPTIONS) {
  return runSignal(candles, {}, assumptions, def);
}

/**
 * 스펙 하나를 받아 실행 가능한 전략으로. 계열에 따라 갈린다.
 * - signal  : 스키마의 조건식으로 판정
 * - 그 외    : 기존 구현을 파라미터만 바꿔 쓴다 (스키마로는 표현하지 못하는 것들)
 */
export function fromSpec(spec, { key = 'submitted', name = 'Submitted strategy' } = {}) {
  validateSpec(spec);

  // 숏·레버리지·봉 안 손절/익절이 있으면 선물형 실행기 (10-09). 없으면 예전 롱 전용 그대로
  if (needsPosition(spec)) {
    return {
      key, name, family: 'submitted', spec, blurb: spec.blurb ?? '', defaults: {}, sweep: spec.sweep ?? null, plot: spec.plot ?? [],
      indicators: () => ({}),
      run: (candles, _p, a = DEFAULT_ASSUMPTIONS) => runSpecPosition(candles, a, spec),
    };
  }
  if (spec.family === 'signal') {
    const def = compileSignal(spec, { key, name });
    return {
      ...def,
      run: (candles, _p, a = DEFAULT_ASSUMPTIONS) => runSignal(candles, {}, a, def),
    };
  }

  const base = {
    scaleIn: STRATEGIES.martingale,
    grid: STRATEGIES.grid,
    periodic: STRATEGIES.dca,
    once: STRATEGIES.buyhold,
  }[spec.family];
  if (!base) throw new SpecError(`실행할 수 없는 계열 '${spec.family}'`);

  const params = { ...base.defaults, ...(spec.params ?? {}) };
  return {
    key, name, family: 'submitted', spec,
    blurb: spec.blurb ?? '',
    defaults: params,
    sweep: spec.sweep ?? null,
    plot: base.plot ?? [],
    run: (candles, p, a = DEFAULT_ASSUMPTIONS) => base.run(candles, { ...params, ...(p ?? {}), ...makeGates(spec, candles) }, a),
  };
}

/** scaleIn 의 filter·entry·add → 봉 번호를 받아 참/거짓. 지표는 한 번만 계산해 둔다 (큰 봉 tf 포함) */
function makeGates(spec, candles) {
  const keys = { filter: '__gate', entry: '__entry', add: '__add' };
  if (!Object.keys(keys).some((k) => spec[k])) return {};
  const ind = Object.fromEntries(Object.entries(spec.indicators ?? {}).map(([id, d]) =>
    [id, computeIndicator(candles, { key: d.kind, params: d.params ?? {}, tf: d.tf })]));
  return Object.fromEntries(Object.entries(keys).filter(([k]) => spec[k]).map(([k, g]) => [g, (i) => evalCond(spec[k], i, candles, ind, null)]));
}
