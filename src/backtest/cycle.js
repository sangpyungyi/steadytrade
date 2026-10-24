// 계단식 순환매매 (Staircase cycle, 10-23) — a live scale-in cycle bot's rules, replayed bar by bar for backtesting.
// Same code the site runs in your browser at steadytrade.net/strategies (family "cycle"). Explanation: docs/strategy-lab.md
//
//   레그 = 한 번의 매수 기록 · 사이클 = 시드부터 전량 청산까지. 롱 기준, 숏은 모든 부호를 뒤집은 거울.
//   신호는 전략 봉 MACD(12,26,9) 히스토그램 h, 완결봉만. 실거래는 1분마다 「직전 완결봉의 h + 현재 호가」로 판정한다 →
//   여기서는 완결봉 j−1 의 신호로 봉 j 동안(시가·고가·저가) 일어나는 일을 계산한다.
//     · 시드: 레그 0 + h 음→양 → 봉 j 시가에 min_notional 어치
//     · 추가 매수: curr h ≥ 0 + 마지막 진입가 대비 drop 하락 → 저가가 트리거가에 닿으면 그 값(시가가 더 낮으면 시가)
//       크기 = 보유 수량 합 × ratio (min_notional 미만이면 min_notional), 보유 명목 + 새 레그 > cap 이면 건너뜀
//     · 사이클 청산: h 양→음 + 사이클 손익률(실현 + 보유 평가, 수수료 차감 / 보유 진입 명목) ≥ exit → 그 손익률이 되는 가격에 고가가 닿으면 전량
//     · 같은 봉에 진입은 한 번. 롱의 청산(curr<0)과 추가 매수(curr≥0)·시드는 같은 봉에 함께 일어날 수 없다 — 봉 안 순서를 추측하지 않아도 된다
//   긴 봉 필터: 봉 j 의 시각에 이미 닫힌 긴 봉의 마지막 h (롱 <0 · 숏 >0 이면 시드·추가 매수만 막음, 35봉 미만이면 막지 않음)
//   펀딩: 계정 단위라 사이클 손익률에는 넣지 않고 자산에서만 뺀다 (실거래와 같게)

export const CYCLE_DEFAULTS = Object.freeze({
  side: 'long', minNotional: 25, dropPct: 0.012, ratioPct: 0.30, capUsd: 216, exitPct: 0.005,
  htf: 'auto', cover: false, coverMinLossPct: 0.01, macdFast: 12, macdSlow: 26, macdSignal: 9,
});
export const HL_MIN_NOTIONAL = 10;     // 하이퍼리퀴드 최소 주문가치 — 설정이 더 작아도 이 값
export const HTF_MIN_BARS = 35;
export const APPROX_FUNDING_YEAR = 0.11;   // 펀딩 데이터가 없을 때 연 11% (롱 부담·숏 수취)

/** 원본 ema — 첫 값으로 시작하는 지수 평균 */
export function emaSeries(arr, span) {
  const a = 2 / (span + 1), out = new Array(arr.length);
  if (!arr.length) return out;
  out[0] = arr[0];
  for (let i = 1; i < arr.length; i++) out[i] = a * arr[i] + (1 - a) * out[i - 1];
  return out;
}
/** 원본 macd_hist_series — 종가 → 히스토그램 (같은 길이). 앞쪽 값만 쓰는 인과 계산 */
export function macdHist(closes, fast = 12, slow = 26, signal = 9) {
  const ef = emaSeries(closes, fast), es = emaSeries(closes, slow);
  const line = ef.map((f, i) => f - es[i]);
  const sig = emaSeries(line, signal);
  return line.map((m, i) => m - sig[i]);
}
/** 긴 봉 이름 — 전략 봉 1h 이하 → 4h, 4h 이상 → 1d (원본 htf_block) */
export const autoHtf = (tfSec) => (tfSec >= 14400 ? '1d' : '4h');

/**
 * 봉 j 마다 쓸 긴 봉 h — 봉 j 시작 시각 t 에 이미 닫힌(time + sec ≤ t) 긴 봉까지만. 35봉 미만이면 null(막지 않음)
 * @param {{time:number}[]} candles 전략 봉  @param {{time:number, close:number}[]} htf 긴 봉  @param {number} sec 긴 봉 길이
 */
export function htfSeries(candles, htf, sec, p = CYCLE_DEFAULTS) {
  const out = new Array(candles.length).fill(null);
  if (!htf?.length) return out;
  const h = macdHist(htf.map((b) => b.close), p.macdFast, p.macdSlow, p.macdSignal);
  let k = 0;   // 닫힌 긴 봉 수
  for (let j = 0; j < candles.length; j++) {
    const t = candles[j].time;
    while (k < htf.length && htf[k].time + sec <= t) k++;
    out[j] = k >= HTF_MIN_BARS ? h[k - 1] : null;
  }
  return out;
}

/**
 * @param candles 전략 봉 [{time, open, high, low, close}] (준비 기간 포함)
 * @param p       CYCLE_DEFAULTS 모양의 값 (분수: dropPct 0.012 = 1.2%)
 * @param a       { feeRate, slipRate }
 * @param opt     { start: 매매를 시작하는 봉 번호, htfH: htfSeries 결과 | null, fundingAt: (t) => 시간당 요율 | null, fundingOff: bool }
 */
export function runCycle(candles, p0, a, opt = {}) {
  const p = { ...CYCLE_DEFAULTS, ...p0 };
  const sgn = p.side === 'short' ? -1 : 1, fee = a.feeRate ?? 0.00045, slip = a.slipRate ?? 0;
  const minN = Math.max(HL_MIN_NOTIONAL, p.minNotional), cap = p.capUsd;
  const start = Math.max(2, opt.start ?? 0);
  const hrs = candles.length > 1 ? (candles[1].time - candles[0].time) / 3600 : 1;
  const h = macdHist(candles.map((c) => c.close), p.macdFast, p.macdSlow, p.macdSignal);
  const htfH = opt.htfH ?? null;
  const fundAt = opt.fundingOff ? null : (opt.fundingAt ?? ((t) => APPROX_FUNDING_YEAR / 8760));
  const fillIn = (px) => px * (1 + sgn * slip), fillOut = (px) => px * (1 - sgn * slip);
  // 레그 순손익 (수수료 양쪽 차감) — 원본 compute_leg_pnl
  const legNet = (l, x) => sgn * (x - l.px) * l.qty - fee * l.qty * (l.px + x);

  let legs = [], realizedCycle = 0, realizedAll = 0, fundingPaid = 0, feesPaid = 0;
  let cyc = null;   // 지금 사이클 { start, startTime, legs: [[time, px, qty, kind]], realized, minPnl }
  const cycles = [], marks = [], equity = [];
  const st = { capHits: 0, htfSeeds: 0, htfAdds: 0, covers: 0, maxInvested: 0, deepest: { usd: 0, time: null }, longest: null };

  const openNotional = () => legs.reduce((s, l) => s + l.qty * l.px, 0);
  const openQty = () => legs.reduce((s, l) => s + l.qty, 0);
  const unreal = (x) => legs.reduce((s, l) => s + legNet(l, x), 0);
  const addLeg = (j, raw, qty, kind) => {
    const px = fillIn(raw), c = candles[j];
    legs.push({ qty, px, time: c.time, i: j });
    feesPaid += fee * qty * px;
    cyc.legs.push([c.time, px, qty, kind]);
    marks.push({ i: j, time: c.time, side: sgn > 0 ? 'buy' : 'sell', kind, price: px, step: legs.length });
    st.maxInvested = Math.max(st.maxInvested, openNotional());
  };
  const closeLegs = (j, raw, which, why) => {
    const x = fillOut(raw);
    let net = 0;
    for (const l of which) { net += legNet(l, x); feesPaid += fee * l.qty * x; }
    legs = legs.filter((l) => !which.includes(l));
    realizedCycle += net; realizedAll += net;
    marks.push({ i: j, time: candles[j].time, side: sgn > 0 ? 'sell' : 'buy', kind: why, price: x });
    return x;
  };

  for (let j = 0; j < candles.length; j++) {
    const c = candles[j];
    if (j >= start) {
      const prev = h[j - 2], curr = h[j - 1];
      const up = prev <= 0 && curr > 0, down = prev >= 0 && curr < 0;
      const seedSig = sgn > 0 ? up : down, exitSig = sgn > 0 ? down : up;
      const momentum = sgn > 0 ? curr >= 0 : curr <= 0;
      const hv = htfH ? htfH[j] : null;
      const blocked = hv != null && (sgn > 0 ? hv < 0 : hv > 0);
      let entered = false;

      // ① 사이클 청산 — 손익률이 exit 가 되는 체결가 X*: R + Σ[sgn(X−e)q − f q(e+X)] = exit·N 을 X 에 대해 푼다
      if (legs.length && exitSig) {
        const N = openNotional(), Q = openQty(), R = realizedCycle;
        const xStar = sgn > 0 ? (p.exitPct * N + N * (1 + fee) - R) / (Q * (1 - fee)) : (R + N * (1 - fee) - p.exitPct * N) / (Q * (1 + fee));
        const rawStar = xStar / (1 - sgn * slip);
        const hitOpen = sgn > 0 ? c.open >= rawStar : c.open <= rawStar;
        const hitBar = sgn > 0 ? c.high >= rawStar : c.low <= rawStar;
        if (hitOpen || hitBar) {
          const x = closeLegs(j, hitOpen ? c.open : rawStar, [...legs], 'exit');
          const bars = j - cyc.start;
          cycles.push({ openTime: cyc.startTime, closeTime: c.time, time: c.time, openIndex: cyc.start, closeIndex: j, entryPrice: cyc.legs[0][1], avgPrice: cyc.avgPx(), exitPrice: x, notional: cyc.maxN, pnl: realizedCycle, steps: cyc.legs.length, bars, legs: cyc.legs, minPnl: cyc.minPnl });
          if (!st.longest || bars > st.longest.bars) st.longest = { bars, from: cyc.startTime, to: c.time };
          legs = []; realizedCycle = 0; cyc = null;
        }
      }
      // ② 커버 (기본 끔) — 원본 compute_cover_target: 손실률 ≥ min 인 가장 최근 레그의 손실을 사이클 실현이 넘으면 그 레그만. 봉 종가로 판정
      if (p.cover && legs.length >= 2) {
        const x = fillOut(c.close);
        const cand = legs.map((l) => ({ l, net: legNet(l, x) })).filter((v) => v.net < 0 && (-v.net / (v.l.qty * v.l.px)) >= p.coverMinLossPct).sort((u, v) => v.l.time - u.l.time);
        if (cand.length && realizedCycle > -cand[0].net) { closeLegs(j, c.close, [cand[0].l], 'cover'); st.covers++; }
      }
      // ③ 추가 매수
      if (legs.length && momentum) {
        const last = legs.reduce((m, l) => (l.time >= m.time ? l : m), legs[0]).px;
        const trig = last * (1 - sgn * p.dropPct);
        const hitOpen = sgn > 0 ? c.open <= trig : c.open >= trig;
        const hitBar = sgn > 0 ? c.low <= trig : c.high >= trig;
        if (hitOpen || hitBar) {
          if (blocked) st.htfAdds++;
          else {
            const raw = hitOpen ? c.open : trig, px = fillIn(raw);
            const qty = Math.max(openQty() * p.ratioPct, minN / px);
            if (openNotional() + qty * px > cap) st.capHits++;
            else { addLeg(j, raw, qty, 'add'); entered = true; }
          }
        }
      }
      // ④ 시드
      if (!legs.length && seedSig && !entered) {
        if (blocked) st.htfSeeds++;
        else {
          const px = fillIn(c.open), qty = minN / px;
          if (qty * px <= cap) {
            cyc = { start: j, startTime: c.time, legs: [], minPnl: 0, maxN: 0, avgPx() { const q = this.legs.reduce((s, v) => s + v[2], 0); return q ? this.legs.reduce((s, v) => s + v[1] * v[2], 0) / q : 0; } };
            realizedCycle = 0;
            addLeg(j, c.open, qty, 'seed');
          }
        }
      }
      if (cyc) cyc.maxN = Math.max(cyc.maxN, openNotional());
    }
    // 펀딩 — 보유 명목 × 시간당 요율 × 봉 시간. 롱은 양수 요율을 내고 숏은 받는다
    if (legs.length && fundAt) fundingPaid += sgn * openQty() * c.close * fundAt(c.time) * hrs;
    // 가장 깊었던 평가손 — 봉 안 가장 나쁜 값(롱 저가 · 숏 고가)
    if (legs.length) {
      const worst = realizedCycle + unreal(fillOut(sgn > 0 ? c.low : c.high));
      if (worst < st.deepest.usd) st.deepest = { usd: worst, time: c.time };
      if (cyc && worst < cyc.minPnl) cyc.minPnl = worst;
    }
    equity.push(cap + realizedAll + (legs.length ? unreal(fillOut(c.close)) : 0) - fundingPaid);
  }

  const last = candles.at(-1);
  const openCycle = legs.length && last ? {
    legs: legs.length, notional: openNotional(), unreal: realizedCycle + unreal(fillOut(last.close)),
    days: (last.time - cyc.startTime) / 86400, since: cyc.startTime, cyclePnlPct: (realizedCycle + unreal(fillOut(last.close))) / openNotional(),
  } : null;
  const finalEquity = equity.at(-1) ?? cap;
  const done = cycles.length, wins = cycles.filter((x) => x.pnl > 0).length;
  return {
    equity, trades: cycles, marks, finalEquity, totalReturn: (finalEquity - cap) / cap, ruined: false, ruinIndex: null,
    cycle: {
      side: p.side, cap, cycles: done, realized: realizedAll, total: finalEquity - cap, avgPnl: done ? cycles.reduce((s, x) => s + x.pnl, 0) / done : null,
      winRate: done ? wins / done : null, longest: st.longest, open: openCycle,
      maxInvested: st.maxInvested, maxInvestedPct: st.maxInvested / cap, capHits: st.capHits,
      deepest: { usd: st.deepest.usd, pctCap: st.deepest.usd / cap, time: st.deepest.time },
      htfSeeds: st.htfSeeds, htfAdds: st.htfAdds, covers: st.covers, fees: feesPaid, fundingPaid,
      maxLegs: cycles.reduce((m, x) => Math.max(m, x.steps), openCycle?.legs ?? 0),
    },
    fundingPaid, openPosition: !!openCycle,
  };
}
