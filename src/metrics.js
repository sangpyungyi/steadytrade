// 성과 지표.
// 수익률은 단독으로 쓰이지 않는다 — 언제나 파산확률·MDD 와 함께 나간다 (ResultCard).

/** 최대 낙폭 (equity 곡선 기준) */
export function maxDrawdown(equity) {
  let peak = -Infinity, mdd = 0, peakAt = 0, troughAt = 0, curPeakAt = 0;
  for (let i = 0; i < equity.length; i++) {
    const v = equity[i];
    if (!Number.isFinite(v)) continue;
    if (v > peak) { peak = v; curPeakAt = i; }
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > mdd) { mdd = dd; peakAt = curPeakAt; troughAt = i; }
  }
  return { mdd, peakAt, troughAt };
}

/**
 * 수중(underwater) 기간.
 * 낙폭이 "얼마나 깊었나"라면 이건 "얼마나 오래였나"다.
 * 사람을 포기하게 만드는 쪽은 대개 이쪽이다.
 */
export function underwaterStats(equity) {
  let peak = -Infinity, run = 0, longest = 0, longestEnd = 0, total = 0;
  for (let i = 0; i < equity.length; i++) {
    const v = equity[i];
    if (!Number.isFinite(v)) continue;
    if (v >= peak) { peak = v; run = 0; }
    else {
      run++; total++;
      if (run > longest) { longest = run; longestEnd = i; }
    }
  }
  const last = equity[equity.length - 1];
  let current = 0;
  for (let i = equity.length - 1; i >= 0; i--) {
    if (equity[i] > last) current++; else break;
  }
  return {
    longestBars: longest,
    longestEndIndex: longestEnd,
    shareUnderwater: equity.length ? total / equity.length : 0,
    endsUnderwater: current > 0,
  };
}

/** 격자 전체에 대한 정직한 요약 — 기본 파라미터 한 칸은 그 자체로 체리피킹이다 */
export function gridRobustness(cells, benchmarkReturn) {
  const vals = cells.map((c) => c.totalReturn).filter(Number.isFinite);
  if (!vals.length) return null;
  const sorted = vals.slice().sort((a, b) => a - b);
  const q = (x) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(x * (sorted.length - 1))))];
  return {
    n: vals.length,
    median: q(0.5),
    worst: sorted[0],
    best: sorted[sorted.length - 1],
    positiveShare: vals.filter((v) => v > 0).length / vals.length,
    beatBenchmarkShare: Number.isFinite(benchmarkReturn)
      ? vals.filter((v) => v > benchmarkReturn).length / vals.length : null,
  };
}

/** 최대 연속 손실 거래 수 */
export function maxConsecutiveLosses(trades) {
  let run = 0, worst = 0;
  for (const t of trades) {
    if (t.pnl < 0) { run++; worst = Math.max(worst, run); }
    else run = 0;
  }
  return worst;
}

/**
 * 승률의 Wilson 점수 신뢰구간 (95%).
 * 13거래에서 나온 69% 와 500거래에서 나온 69% 는 같은 숫자가 아니다.
 * 구간이 0.5 를 걸치면 그 승률은 동전던지기와 구분되지 않는다.
 */
export function wilsonInterval(wins, n, z = 1.96) {
  if (!n) return null;
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - spread) / d), Math.min(1, (centre + spread) / d)];
}

export function tradeStats(trades) {
  const closed = trades.filter((t) => Number.isFinite(t.pnl));
  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? wins.length / closed.length : null,
    winRateCI: wilsonInterval(wins.length, closed.length),
    // 구간이 0.5 를 걸치면 이 승률은 동전던지기와 구분되지 않는다
    winRateInformative: (() => {
      const ci = wilsonInterval(wins.length, closed.length);
      return ci ? (ci[0] > 0.5 || ci[1] < 0.5) : false;
    })(),
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    avgWin: wins.length ? grossWin / wins.length : null,
    avgLoss: losses.length ? -grossLoss / losses.length : null,
    maxConsecutiveLosses: maxConsecutiveLosses(closed),
  };
}

/**
 * 파산 확률.
 * 시작 시점을 바꿔가며 같은 전략을 돌린 결과 중 파산한 비율.
 * 단일 수익률이 못 보여주는 것이 이것이다.
 */
export function riskOfRuin(runs) {
  const n = runs.length;
  if (!n) return null;
  return runs.filter((r) => r.ruined).length / n;
}

/** 수익률 분포 — 단일 숫자 대신 이걸 보여준다 */
export function distribution(values) {
  const v = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.floor(p * (v.length - 1))))];
  return {
    n: v.length,
    min: v[0],
    p10: q(0.10),
    p25: q(0.25),
    median: q(0.50),
    p75: q(0.75),
    p90: q(0.90),
    max: v[v.length - 1],
    mean: v.reduce((s, x) => s + x, 0) / v.length,
    negativeShare: v.filter((x) => x < 0).length / v.length,
  };
}

/**
 * 결과 카드 — 수익률만 떼어낼 수 없게 묶는다.
 * 사이트는 이 객체만 렌더한다.
 */
export function resultCard({ totalReturn, ruin, mdd, period, params, assumptionsId, extra = {} }) {
  if (!Number.isFinite(totalReturn)) throw new Error('resultCard: totalReturn 필요');
  if (ruin === undefined || ruin === null) throw new Error('resultCard: ruin 없이 수익률을 낼 수 없다');
  if (!Number.isFinite(mdd)) throw new Error('resultCard: mdd 없이 수익률을 낼 수 없다');
  if (!period?.from || !period?.to) throw new Error('resultCard: 구간 표기 필수');
  if (!assumptionsId) throw new Error('resultCard: 가정 없는 숫자는 존재할 수 없다');
  return Object.freeze({ totalReturn, ruin, mdd, period, params, assumptionsId, ...extra });
}
