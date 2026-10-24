// 접수받은 전략의 파라미터 격자.
//
// 이 사이트가 교과서 전략에 대해 하는 말 — "한 설정에서만 되는 전략은 맞춘 것이지 되는 게 아니다" —
// 는 제출받은 전략에도 똑같이 적용돼야 한다. 그러지 않으면 제출자에게만 후한 잣대를 대는 것이다.
//
// 스펙은 상수로 굳은 규칙이라 params 를 바꿔 끼울 수 없다. 그래서 **스펙 자체를 변형해서** 격자를 만든다.
import { maxDrawdown } from '../metrics.js';
import { validateSpec, PARAM_LIMITS } from './spec.js';

const r4 = (v) => (Number.isFinite(v) ? Number(v.toFixed(4)) : null);

/** 원래 값 주변으로 네 점. 정수였으면 정수로 유지한다. */
function around(v, lo = null, hi = null) {
  const isInt = Number.isInteger(v);
  const out = [];
  for (const m of [0.5, 0.75, 1, 1.5]) {
    let x = v * m;
    x = isInt ? Math.max(1, Math.round(x)) : Number(x.toFixed(6));
    if (lo !== null && x < lo) continue;
    if (hi !== null && x > hi) continue;
    if (!out.includes(x)) out.push(x);
  }
  return out.sort((a, b) => a - b);
}

/** 어떤 두 파라미터를 흔들지 고른다. 흔들 게 없으면 null. */
function pickAxes(spec) {
  if (spec.family === 'signal') {
    const axes = [];
    for (const [id, d] of Object.entries(spec.indicators ?? {})) {
      for (const [k, v] of Object.entries(d.params ?? {})) {
        if (Number.isFinite(v)) axes.push({ path: ['indicators', id, 'params', k], key: `${id}.${k}`, value: v, lo: 1, hi: null });
      }
    }
    // 진입/청산에 상수 문턱만 있는 규칙(예: 익절 3%)도 흔들 가치가 있다.
    if (axes.length < 2) {
      for (const side of ['exit', 'entry']) {
        walkConsts(spec[side], [side], (path, v) => {
          if (axes.length < 2 && Number.isFinite(v) && v !== 0) {
            axes.push({ path, key: `${side}:${v}`, value: v, lo: null, hi: null });
          }
        });
      }
    }
    return axes.slice(0, 2);
  }

  const lim = PARAM_LIMITS[spec.family] ?? {};
  // 계열별로 결과를 가장 크게 가르는 둘
  const prefer = {
    scaleIn: ['dropPct', 'multiplier'],
    grid: ['levels', 'rangePct'],
    periodic: ['intervalBars', 'amountPct'],
    once: [],
  }[spec.family] ?? [];
  return prefer
    .filter((k) => Number.isFinite(spec.params?.[k]))
    .map((k) => ({ path: ['params', k], key: k, value: spec.params[k], lo: lim[k]?.[0] ?? null, hi: lim[k]?.[1] ?? null }));
}

function walkConsts(node, path, fn) {
  if (!node || typeof node !== 'object') return;
  if (node.op === 'and' || node.op === 'or') {
    node.of.forEach((x, i) => walkConsts(x, [...path, 'of', i], fn));
    return;
  }
  if (node.op === 'not') { walkConsts(node.of, [...path, 'of'], fn); return; }
  for (const side of ['a', 'b']) {
    if (node[side] && 'const' in node[side]) fn([...path, side, 'const'], node[side].const);
  }
}

const clone = (o) => JSON.parse(JSON.stringify(o));

function setAt(obj, path, v) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  cur[path.at(-1)] = v;
}

/**
 * 격자를 돌린다. run.mjs 의 sweepHeatmap 과 같은 모양의 결과를 낸다 —
 * 같은 표로 그려져야 제출 전략과 교과서 전략을 나란히 볼 수 있다.
 *
 * @param makeStrat 스펙 하나를 실행 가능한 전략으로 만드는 함수
 */
export function specSweep(spec, candles, makeStrat) {
  const axes = pickAxes(spec);
  if (!axes.length) return null;

  const [ax, ay] = axes;
  const xs = around(ax.value, ax.lo, ax.hi);
  const ys = ay ? around(ay.value, ay.lo, ay.hi) : [null];
  if (xs.length < 2 && ys.length < 2) return null;

  const cells = [];
  for (const vy of ys) {
    for (const vx of xs) {
      const s = clone(spec);
      setAt(s, ax.path, vx);
      if (ay) setAt(s, ay.path, vy);

      // 빠른 선이 느린 선보다 길면 애초에 뜻이 없는 설정이다. 교차 전략의 격자와 같은 규칙.
      const bad = Object.values(s.indicators ?? {}).some(
        (d) => Number.isFinite(d.params?.fast) && Number.isFinite(d.params?.slow) && d.params.fast >= d.params.slow);
      if (bad) { cells.push({ x: vx, y: vy, totalReturn: null, mdd: null, ruined: false, trades: 0, invalid: true }); continue; }

      let r;
      try {
        validateSpec(s);
        r = makeStrat(s).run(candles, {});
      } catch {
        // 범위를 벗어난 조합은 격자에서 빈 칸으로 둔다 — 없는 숫자를 지어내지 않는다.
        cells.push({ x: vx, y: vy, totalReturn: null, mdd: null, ruined: false, trades: 0, invalid: true });
        continue;
      }
      const { mdd } = maxDrawdown(r.equity);
      cells.push({ x: vx, y: vy, totalReturn: r4(r.totalReturn), mdd: r4(mdd), ruined: r.ruined, trades: r.trades.length });
    }
  }
  return { xKey: ax.key, yKey: ay?.key ?? null, xValues: xs, yValues: ys, cells };
}
