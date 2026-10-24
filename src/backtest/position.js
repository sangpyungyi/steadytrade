// 롱·숏·레버리지 실행기 (10-09) — 무기한 선물처럼 굴린다. 신호형 스펙에서 숏·레버리지·봉 안 손절/익절을 쓸 때만 탄다.
// 롱 전용·1배·손절 없는 스펙은 예전 runSignal 을 그대로 쓴다 (교과서 전략·발행된 결과의 숫자가 바뀌지 않게).
//
// 규약 (엔진 공통 규약 + 선물 쪽 보수적 가정):
//  - 신호는 봉 종가에서 판정, 체결은 다음 봉 시가 (같은 봉 종가 체결은 미래를 보는 것)
//  - 진입 크기 = 평가액 × 레버리지 × sizePct. 수수료는 명목가에 taker, 슬리피지는 늘 불리한 쪽
//  - 펀딩: 보유하는 동안 명목가 × fundingPct8h × (봉 길이 / 8시간) 을 롱·숏 모두 낸다 (받는 쪽으로 잡지 않는다)
//    10-12: 부르는 쪽이 a.fundingByDay({UTC 날 번호: 8시간당 비율}, 실제 거래소 기록)를 주면 그날 값을 방향대로 — 양수면 롱이 내고 숏이 받는다.
//    기록이 없는 날은 위의 보수적 가정 그대로. 안 주면 예전과 같다 (발행된 결과 숫자 불변)
//  - 봉 안 순서를 모르므로 불리한 사건 먼저: 손절 → 강제 청산 → 익절 (롱은 저가, 숏은 고가로 판정)
//  - 강제 청산: 평가액이 유지 증거금(명목가의 0.5%) 이하가 되는 가격에 닿으면 그 가격에 청산, 수수료까지 낸다
//  - 같은 봉에 반대 신호가 나오면 청산이 먼저 — 다음 봉 시가에 청산하고 그 봉 종가에서 다시 판정
import { evalCond } from '../schema/spec.js';
import { computeIndicator, barSeconds } from './htf.js';
import { finish } from './engine.js';

const MAINT = 0.005;

export function runSpecPosition(candles, a, spec) {
  const lev = spec.leverage ?? 1, size = spec.sizePct ?? 1;
  const funding = spec.fundingPct8h ?? (lev > 1 || spec.shortEntry ? 0.0001 : 0);
  const fundDay = spec.fundingPct8h === undefined ? a.fundingByDay ?? null : null;   // 사용자가 펀딩을 정했으면 그 값을 쓴다
  const stopPct = spec.stopPct ?? null, takePct = spec.takePct ?? null;
  const ind = Object.fromEntries(Object.entries(spec.indicators ?? {}).map(([id, d]) =>
    [id, computeIndicator(candles, { key: d.kind, params: d.params ?? {}, tf: d.tf })]));
  const barH = (barSeconds(candles) || 86400) / 3600;

  const acc = { seed: a.seed, cash: a.seed };
  let pos = null;            // { side: 1 | -1, qty, entry, entryIndex, notional, fundingPaid }
  let pending = null;        // 'long' | 'short' | 'close'
  const equity = [], trades = [], marks = [];
  let ruinedAt = -1, liquidations = 0, stops = 0, takes = 0, fundingTotal = 0, feeTotal = 0;
  const eqAt = (price) => acc.cash + (pos ? pos.side * pos.qty * (price - pos.entry) : 0);
  acc.equity = eqAt;

  const open = (side, i, price) => {
    const px = price * (1 + side * a.slipRate);
    const eq = eqAt(price);
    if (eq <= 0) return;
    const notional = eq * lev * size;
    const fee = notional * a.feeRate;
    acc.cash -= fee; feeTotal += fee;
    pos = { side, qty: notional / px, entry: px, entryIndex: i, notional, fundingPaid: 0, fees: fee };
    marks.push({ i, time: candles[i].time, side: side > 0 ? 'buy' : 'short', price: px });
  };
  const close = (i, price, why) => {
    const px = price * (1 - pos.side * a.slipRate);
    const pnl = pos.side * pos.qty * (px - pos.entry);
    const fee = pos.qty * px * a.feeRate;
    acc.cash += pnl - fee; feeTotal += fee;
    trades.push({
      openIndex: pos.entryIndex, closeIndex: i, openTime: candles[pos.entryIndex].time, closeTime: candles[i].time, time: candles[i].time,
      side: pos.side > 0 ? 'long' : 'short', entryPrice: pos.entry, exitPrice: px, notional: pos.notional,
      bars: i - pos.entryIndex, pnl: pnl - fee - pos.fees - pos.fundingPaid, why,
    });
    marks.push({ i, time: candles[i].time, side: pos.side > 0 ? 'sell' : 'cover', price: px, why });
    pos = null;
  };

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    // 1) 전 봉 신호를 이번 봉 시가에
    if (pending === 'close' && pos) close(i, c.open, 'signal');
    else if ((pending === 'long' || pending === 'short') && !pos) open(pending === 'long' ? 1 : -1, i, c.open);
    pending = null;

    // 2) 봉 안: 손절 → 강제 청산 → 익절 (불리한 것 먼저)
    if (pos) {
      const worst = pos.side > 0 ? c.low : c.high, best = pos.side > 0 ? c.high : c.low;
      const stopPx = stopPct ? pos.entry * (1 - pos.side * stopPct) : null;
      // 평가액이 유지 증거금이 되는 가격: cash + side·qty·(p − entry) = MAINT·qty·p
      const liqPx = (acc.cash - pos.side * pos.qty * pos.entry) / (MAINT * pos.qty - pos.side * pos.qty);
      const hitStop = stopPx != null && (pos.side > 0 ? worst <= stopPx : worst >= stopPx);
      const hitLiq = Number.isFinite(liqPx) && liqPx > 0 && (pos.side > 0 ? worst <= liqPx : worst >= liqPx);
      const stopFirst = hitStop && (!hitLiq || (pos.side > 0 ? stopPx >= liqPx : stopPx <= liqPx));
      if (stopFirst) { stops++; close(i, pos.side > 0 ? Math.min(stopPx, c.open) : Math.max(stopPx, c.open), 'stop'); }
      else if (hitLiq) { liquidations++; close(i, pos.side > 0 ? Math.min(liqPx, c.open) : Math.max(liqPx, c.open), 'liquidation'); }
      else if (takePct) {
        const tp = pos.entry * (1 + pos.side * takePct);
        if (pos.side > 0 ? best >= tp : best <= tp) { takes++; close(i, pos.side > 0 ? Math.max(tp, c.open) : Math.min(tp, c.open), 'take'); }
      }
    }
    // 3) 펀딩 (봉 하나 보유)
    if (pos && (funding || fundDay)) {
      const r = fundDay ? fundDay[Math.floor(c.time / 86400)] : undefined;
      const f = r !== undefined ? pos.side * pos.qty * c.close * r * (barH / 8) : pos.qty * c.close * funding * (barH / 8);
      acc.cash -= f; pos.fundingPaid += f; fundingTotal += f;
    }
    // 4) 종가에서 신호 판정 → 다음 봉 시가 체결
    const p = pos ? { inPos: true, entryPrice: pos.entry, barsHeld: i - pos.entryIndex, side: pos.side } : null;
    const posVals = p;   // side 가 있으면 gainPct 를 숏 기준(내리면 +)으로 읽는다 (spec.js readValue)
    if (pos) {
      const ex = pos.side > 0 ? spec.exit : spec.shortExit;
      if (ex && evalCond(ex, i, candles, ind, posVals)) pending = 'close';
    } else {
      if (spec.entry && evalCond(spec.entry, i, candles, ind, null)) pending = 'long';
      else if (spec.shortEntry && evalCond(spec.shortEntry, i, candles, ind, null)) pending = 'short';
    }

    const eq = eqAt(c.close);
    equity.push(eq);
    if (ruinedAt < 0 && eq <= a.seed * a.ruinThreshold) { ruinedAt = i; break; }
  }
  while (equity.length < candles.length) equity.push(equity.at(-1) ?? a.seed);
  const held = trades.reduce((s, t) => s + t.bars, 0) + (pos ? candles.length - 1 - pos.entryIndex : 0);
  return finish(acc, candles, equity, trades, ruinedAt, marks, {
    baseNotional: a.seed, exposureShare: candles.length ? held / candles.length : 0, openPosition: !!pos, series: ind,
    leverage: lev, liquidations, stops, takes, fundingPaid: fundingTotal, feesPaid: feeTotal,
    longTrades: trades.filter((t) => t.side === 'long').length, shortTrades: trades.filter((t) => t.side === 'short').length,
  });
}
