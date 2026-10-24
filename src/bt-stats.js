// 백테스트 자세한 통계 (10-10) — 수익률 하나로는 전략을 판단할 수 없다.
// 위험 대비 수익(샤프·소르티노·칼마), 거래 한 번의 질(손익비·t 값·평균 보유), 연도별, 앞 70%·뒤 30% 구간(과최적화 점검).
// 모두 엔진 결과(res.equity·res.trades)와 단순 보유(bench.equity)에서 계산한다. 모델은 숫자를 만들지 않는다.
const DAY = 86400, YEAR = 365 * DAY;
const r4 = (v) => (Number.isFinite(v) ? Number(v.toFixed(4)) : null);

/** 봉마다의 자산 → UTC 하루 끝 값 [[time, equity]] */
function daily(equity, candles) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const d = Math.floor(candles[i].time / DAY);
    if (!Number.isFinite(equity[i])) continue;
    if (out.length && out.at(-1)[0] === d) out.at(-1)[1] = equity[i]; else out.push([d, equity[i]]);
  }
  return out;
}
function riskRatios(equity, candles) {
  const d = daily(equity, candles);
  const rets = [];
  for (let i = 1; i < d.length; i++) if (d[i - 1][1] > 0) rets.push(d[i][1] / d[i - 1][1] - 1);
  if (rets.length < 30) return { sharpe: null, sortino: null, vol: null };
  const m = rets.reduce((s, x) => s + x, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((s, x) => s + (x - m) ** 2, 0) / (rets.length - 1));
  const dd = Math.sqrt(rets.reduce((s, x) => s + Math.min(0, x) ** 2, 0) / rets.length);
  // 1년에 거래일이 몇 개인지는 데이터에서 센다 (10-12: 365 고정이라 주식은 샤프·변동성이 약 20% 크게 나왔다. 코인은 그대로 365)
  const yrs = (d.at(-1)[0] - d[0][0]) / 365;
  const n = yrs > 0 ? rets.length / yrs : 365;
  return { sharpe: sd > 0 ? (m / sd) * Math.sqrt(n) : null, sortino: dd > 0 ? (m / dd) * Math.sqrt(n) : null, vol: sd * Math.sqrt(n) };
}
function maxDD(equity, from = 0, to = equity.length) {
  let peak = -Infinity, worst = 0;
  for (let i = from; i < to; i++) { const v = equity[i]; if (!Number.isFinite(v)) continue; peak = Math.max(peak, v); if (peak > 0) worst = Math.max(worst, 1 - v / peak); }
  return worst;
}
const growth = (eq, a, b) => (eq[a] > 0 && Number.isFinite(eq[b]) ? eq[b] / eq[a] - 1 : null);

/** 거래 한 번당 수익(명목 대비) */
export const tradeReturns = (trades) => (trades ?? []).filter((x) => Number.isFinite(x.pnl) && x.notional > 0).map((x) => x.pnl / x.notional);

function tradeQuality(trades) {
  const tr = (trades ?? []).filter((x) => Number.isFinite(x.pnl) && x.notional > 0);
  const r = tr.map((x) => x.pnl / x.notional);
  if (!r.length) return { n: 0 };
  const n = r.length, mean = r.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const wins = r.filter((x) => x > 0), losses = r.filter((x) => x < 0);
  const gw = tr.filter((x) => x.pnl > 0).reduce((s, x) => s + x.pnl, 0), gl = -tr.filter((x) => x.pnl < 0).reduce((s, x) => s + x.pnl, 0);
  let run = 0, streak = 0;
  for (const x of r) { if (x < 0) { run++; streak = Math.max(streak, run); } else run = 0; }
  const holds = tr.map((x) => (x.closeTime - x.openTime) / DAY).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    n, mean, t: sd > 0 && n >= 5 ? mean / (sd / Math.sqrt(n)) : null,
    profitFactor: gl > 0 ? gw / gl : null,
    avgWin: wins.length ? wins.reduce((s, x) => s + x, 0) / wins.length : null,
    avgLoss: losses.length ? losses.reduce((s, x) => s + x, 0) / losses.length : null,
    lossStreak: streak,
    holdDays: holds.length ? holds[Math.floor(holds.length / 2)] : null,   // 중앙값 — 한두 건의 긴 보유에 끌리지 않게
  };
}

/**
 * res: 전략 실행 결과, bench: 단순 보유 실행 결과 (같은 봉)
 * 돌려주는 것은 보고서에 그대로 싣는 작은 객체
 */
export function deepStats(res, bench, candles) {
  const eq = res.equity, be = bench.equity, n = candles.length;
  const years = (candles.at(-1).time - candles[0].time) / YEAR;
  const total = res.totalReturn, hold = bench.totalReturn;
  const cagr = years > 0.25 && total > -1 ? Math.pow(1 + total, 1 / years) - 1 : null;
  const mdd = maxDD(eq), holdMdd = maxDD(be);
  const rr = riskRatios(eq, candles), hr = riskRatios(be, candles);
  const q = tradeQuality(res.trades);

  // 연도별 — 그 해 첫 봉 → 마지막 봉
  const byYear = [];
  let s = 0;
  for (let i = 1; i <= n; i++) {
    const y0 = new Date(candles[s].time * 1000).getUTCFullYear();
    if (i === n || new Date(candles[i].time * 1000).getUTCFullYear() !== y0) {
      const e = i - 1;
      const inYear = (res.trades ?? []).filter((x) => x.closeTime >= candles[s].time && x.closeTime <= candles[e].time).length;
      byYear.push({ year: y0, ret: r4(growth(eq, s, e)), hold: r4(growth(be, s, e)), trades: inYear, partial: (candles[e].time - candles[s].time) < 300 * DAY });
      s = i;
    }
  }
  // 앞 70% · 뒤 30% — 규칙을 앞 구간에 맞춰 골랐다면 뒤 구간에서 무너지는지
  const cut = Math.floor(n * 0.7);
  const part = (a, b) => {
    const tr = (res.trades ?? []).filter((x) => x.openTime >= candles[a].time && x.openTime <= candles[b].time);
    const tq = tradeQuality(tr);
    return { from: new Date(candles[a].time * 1000).toISOString().slice(0, 10), to: new Date(candles[b].time * 1000).toISOString().slice(0, 10),
      ret: r4(growth(eq, a, b)), hold: r4(growth(be, a, b)), mdd: r4(maxDD(eq, a, b + 1)), trades: tq.n, mean: r4(tq.mean) };
  };
  return {
    cagr: r4(cagr), mdd: r4(mdd), holdMdd: r4(holdMdd), calmar: cagr != null && mdd > 0 ? r4(cagr / mdd) : null,
    sharpe: r4(rr.sharpe), sortino: r4(rr.sortino), vol: r4(rr.vol), holdSharpe: r4(hr.sharpe), holdVol: r4(hr.vol),
    trades: q.n, tradeMean: r4(q.mean), tradeT: r4(q.t), profitFactor: r4(q.profitFactor), avgWin: r4(q.avgWin), avgLoss: r4(q.avgLoss),
    lossStreak: q.lossStreak ?? 0, holdDays: r4(q.holdDays),
    years: byYear, split: n >= 100 ? { early: part(0, cut - 1), late: part(cut, n - 1) } : null,
  };
}

/** 모델에게 줄 짧은 모양 (퍼센트) */
export function deepForModel(d) {
  const p = (v) => (v == null ? null : r4(v * 100));
  return {
    cagr_pct: p(d.cagr), sharpe: d.sharpe, sortino: d.sortino, calmar: d.calmar, buy_and_hold_sharpe: d.holdSharpe,
    volatility_pct: p(d.vol), buy_and_hold_max_drawdown_pct: d.holdMdd != null ? -p(d.holdMdd) : null,
    per_trade_t: d.tradeT, profit_factor: d.profitFactor, avg_win_pct: p(d.avgWin), avg_loss_pct: p(d.avgLoss),
    longest_losing_streak: d.lossStreak, median_hold_days: d.holdDays,
    by_year: d.years.map((y) => ({ year: y.year, strategy_pct: p(y.ret), buy_and_hold_pct: p(y.hold), trades: y.trades, ...(y.partial ? { partial_year: true } : {}) })),
    first_70pct: d.split ? { ...d.split.early, ret: p(d.split.early.ret), hold: p(d.split.early.hold), mdd: d.split.early.mdd != null ? -p(d.split.early.mdd) : null, mean: p(d.split.early.mean) } : null,
    last_30pct: d.split ? { ...d.split.late, ret: p(d.split.late.ret), hold: p(d.split.late.hold), mdd: d.split.late.mdd != null ? -p(d.split.late.mdd) : null, mean: p(d.split.late.mean) } : null,
  };
}
