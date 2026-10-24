// 큰 봉 지표 — 1시간봉으로 돌리면서 "4시간봉 MACD" 처럼 더 긴 봉의 지표를 조건에 쓸 때 (10-08 추가).
//
// 받은 봉을 UTC 경계(4h = 00·04·08… / 1d = 00:00)로 묶어 큰 봉을 만들고, 지표는 큰 봉에서 계산한다.
// 작은 봉 i 에는 "i 가 닫히는 순간까지 이미 닫힌" 큰 봉의 값만 준다 — 아직 진행 중인 큰 봉을 보면 미래를 엿본 결과가 된다.
// 실거래(운영 엔진의 HTF 필터)도 마지막 완결봉만 본다. 같은 규칙이어야 백테스트가 운영과 맞는다.
import { runIndicator } from '../indicators.js';

export const TF_SEC = { '1h': 3600, '4h': 14400, '1d': 86400 };

/** 받은 봉의 간격(초) — 가장 흔한 간격 */
export function barSeconds(candles) {
  const n = {};
  for (let i = 1; i < Math.min(candles.length, 200); i++) { const d = candles[i].time - candles[i - 1].time; n[d] = (n[d] ?? 0) + 1; }
  return Number(Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0);
}

/** 큰 봉 묶기: [{time, open, high, low, close, volume, end}] — end = 큰 봉이 닫히는 시각 */
export function resample(candles, tfSec) {
  const out = [];
  for (const c of candles) {
    const start = Math.floor(c.time / tfSec) * tfSec;
    const last = out[out.length - 1];
    if (last && last.time === start) {
      last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low);
      last.close = c.close; last.volume = (last.volume ?? 0) + (c.volume ?? 0);
    } else out.push({ time: start, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0, end: start + tfSec });
  }
  return out;
}

/**
 * 지표 하나 계산. spec = { key, params, tf? }. tf 가 받은 봉보다 길면 큰 봉에서 계산해 작은 봉에 펼친다.
 * 결과 모양은 runIndicator 와 같다 ({출력이름: 배열}) — 길이는 받은 봉 수.
 */
export function computeIndicator(candles, spec) {
  const tfSec = TF_SEC[spec.tf];
  const base = barSeconds(candles);
  if (!tfSec || !base || tfSec <= base) return runIndicator(spec.key, candles, spec.params);
  const big = resample(candles, tfSec);
  const r = runIndicator(spec.key, big, spec.params);
  const out = Object.fromEntries(Object.keys(r).map((k) => [k, new Array(candles.length).fill(null)]));
  let k = -1;   // 작은 봉 i 가 닫힐 때까지 닫힌 마지막 큰 봉
  for (let i = 0; i < candles.length; i++) {
    const closeAt = candles[i].time + base;
    while (k + 1 < big.length && big[k + 1].end <= closeAt) k++;
    if (k < 0) continue;
    for (const name of Object.keys(r)) out[name][i] = r[name][k] ?? null;
  }
  return out;
}
