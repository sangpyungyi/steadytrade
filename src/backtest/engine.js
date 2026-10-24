// 백테스트 코어.
//
// 규약 (전부 보수적으로 잡는다 — 낙관적 가정은 이 사이트를 거짓말쟁이로 만든다):
//  - 현물 롱 온리. 레버리지·공매도 없음
//  - 체결은 지정가에 슬리피지를 더한 값. 수수료는 taker 기준
//  - 봉 내부 순서를 알 수 없으므로 **불리한 사건을 먼저 처리한다**
//    (추가매수가 먼저 터지고 익절이 나중에 — 마틴게일에 불리한 쪽)
//  - 갭은 메우지 않는다

export const DEFAULT_ASSUMPTIONS = Object.freeze({
  id: 'a1-taker10-slip05',
  feeRate: 0.001,    // 0.1% taker
  slipRate: 0.0005,  // 0.05%
  seed: 10000,       // 시드 자본 (USDT)
  ruinThreshold: 0.1, // 평가액이 시드의 10% 이하면 파산 처리
  note: '수수료 0.1%(taker) + 슬리피지 0.05%. 봉 내부에서는 불리한 사건을 먼저 체결.',
});

export class Account {
  constructor(seed, a) {
    this.cash = seed; this.units = 0; this.seed = seed;
    this.fee = a.feeRate; this.slip = a.slipRate;
    this.deployed = 0; this.maxDeployed = 0;
  }
  equity(price) { return this.cash + this.units * price; }
  canBuy(notional) { return this.cash >= notional * (1 + this.fee) - 1e-9; }
  buy(price, notional) {
    const px = price * (1 + this.slip);
    const cost = notional * (1 + this.fee);
    if (this.cash < cost - 1e-9) return null;
    const units = notional / px;
    this.cash -= cost; this.units += units;
    this.deployed += notional;
    this.maxDeployed = Math.max(this.maxDeployed, this.deployed);
    return { px, units, notional, cost };
  }
  sellAll(price) {
    if (this.units <= 0) return null;
    const px = price * (1 - this.slip);
    const gross = this.units * px;
    const net = gross * (1 - this.fee);
    const units = this.units;
    this.cash += net; this.units = 0; this.deployed = 0;
    return { px, units, net };
  }
  /** 보유량의 frac 만 판다 (일부 청산) — 투입액도 같은 비율로 줄인다 */
  sellPart(price, frac) {
    if (this.units <= 0) return null;
    if (frac >= 1) return this.sellAll(price);
    const px = price * (1 - this.slip);
    const units = this.units * frac;
    const net = units * px * (1 - this.fee);
    this.cash += net; this.units -= units; this.deployed *= 1 - frac;
    return { px, units, net };
  }
}

export function finish(acc, candles, equity, trades, ruinedAt, marks, extra = {}) {
  const last = candles.at(-1);
  const finalEquity = ruinedAt >= 0 ? equity[ruinedAt]
    : last ? acc.equity(last.close) : acc.seed;
  return {
    equity, trades, marks,
    ruined: ruinedAt >= 0,
    ruinIndex: ruinedAt >= 0 ? ruinedAt : null,
    finalEquity,
    totalReturn: (finalEquity - acc.seed) / acc.seed,
    maxDeployedMultiple: extra.baseNotional ? acc.maxDeployed / extra.baseNotional : null,
    ...extra,
  };
}

// ─────────────────────────────────────────────── 마틴게일 (물타기형)

export const martingale = {
  key: 'martingale',
  name: 'Martingale',
  family: 'position',
  blurb: 'Double down after every loss. Every closed trade is a winner by construction — that is what makes it dangerous.',
  defaults: { basePct: 0.02, dropPct: 0.05, multiplier: 2.0, takeProfitPct: 0.03, maxSteps: 10 },
  sweep: { multiplier: [1.5, 2.0, 2.5, 3.0], dropPct: [0.03, 0.05, 0.08, 0.12] },
  // 선택 (10-09): __entry(i) 참일 때만 새 사이클 · __add(i) 가 있으면 dropPct 아래 + 그 조건이 참인 봉 종가에 추가매수
  //   takeFraction < 1 → 익절가에서 그 비율만 팔고, 나머지는 runnerTakePct(기본 익절폭×2) 에서 팔거나 평균가로 돌아오면 본전 정리
  run(candles, p, a = DEFAULT_ASSUMPTIONS) {
    const acc = new Account(a.seed, a);
    const baseNotional = a.seed * p.basePct;
    const takeFraction = Math.min(Math.max(p.takeFraction ?? 1, 0.1), 1);
    const runnerTake = p.runnerTakePct ?? p.takeProfitPct * 2;
    const equity = [], trades = [], marks = [];
    let step = 0, avgCost = 0, nextBuy = 0, cycleStart = 0, ruinedAt = -1, stuck = 0;
    let firstPx = 0; // 사이클 첫 진입가
    let runner = false, lockedAvg = 0, cycleCost = 0, realized = 0, partials = 0;
    let expSum = 0, expMax = 0, expN = 0;   // 자금 중 실제로 들어가 있던 비율 (봉마다)

    const closeCycle = (i, c, s, avgPx) => {
      trades.push({
        openIndex: cycleStart, closeIndex: i,
        openTime: candles[cycleStart].time, closeTime: c.time, time: c.time,
        entryPrice: firstPx, avgPrice: avgPx, exitPrice: s.px,
        notional: cycleCost, steps: step, bars: i - cycleStart,
        pnl: realized + s.net - cycleCost,
      });
      marks.push({ i, time: c.time, side: 'sell', step, price: s.px });
      step = 0; avgCost = 0; runner = false; cycleCost = 0; realized = 0;
    };

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];

      // filter(__gate)가 거짓이면 새 사이클·물타기를 쉰다. 익절은 그대로 (운영 계단식 HTF 필터와 같은 규칙)
      const open = !p.__gate || p.__gate(i);
      if (step === 0) {
        const f = open && (!p.__entry || p.__entry(i)) ? acc.buy(c.close, baseNotional) : null;
        if (f) {
          step = 1; avgCost = f.cost; cycleCost = f.cost; cycleStart = i; firstPx = f.px;
          nextBuy = f.px * (1 - p.dropPct);
          marks.push({ i, time: c.time, side: 'buy', step, price: f.px });
        }
      } else if (runner) {
        // 일부 청산 뒤 남은 몫: 불리한 사건 먼저 — 평균가로 돌아오면 본전 정리, 아니면 2차 목표가
        const target2 = lockedAvg * (1 + runnerTake);
        if (c.low <= lockedAvg) closeCycle(i, c, acc.sellAll(Math.min(lockedAvg, c.open)), lockedAvg);
        else if (c.high >= target2) closeCycle(i, c, acc.sellAll(target2), lockedAvg);
      } else {
        // 불리한 사건 먼저: 추가매수
        const want = p.__add ? c.close <= nextBuy && p.__add(i) : c.low <= nextBuy;
        if (open && want && step < p.maxSteps) {
          const notional = baseNotional * Math.pow(p.multiplier, step);
          if (acc.canBuy(notional)) {
            // 조건 추가매수는 그 봉 종가에. 필터가 쉬는 동안 목표가 아래로 내려갔다면 다시 열린 봉 시가에 산다 (목표가에 산 것으로 치면 실제보다 나쁘게 잡힌다)
            const f = acc.buy(p.__add ? c.close : p.__gate ? Math.min(nextBuy, c.open) : nextBuy, notional);
            step++; avgCost += f.cost; cycleCost += f.cost;
            nextBuy = f.px * (1 - p.dropPct);
            marks.push({ i, time: c.time, side: 'buy', step, price: f.px });
          } else {
            stuck++;
          }
        }
        // 익절
        const avgPx = acc.units > 0 ? avgCost / acc.units : Infinity;
        const target = avgPx * (1 + p.takeProfitPct);
        if (acc.units > 0 && c.high >= target) {
          if (takeFraction < 1) {
            const s = acc.sellPart(target, takeFraction);
            realized += s.net; runner = true; lockedAvg = avgPx; partials++;
            marks.push({ i, time: c.time, side: 'sell', step, price: s.px, partial: true });
          } else {
            closeCycle(i, c, acc.sellAll(target), avgPx);
          }
        }
      }

      const eq = acc.equity(c.close);
      equity.push(eq);
      if (eq > 0) { const x = (acc.units * c.close) / eq; expSum += x; expN++; if (x > expMax) expMax = x; }
      if (ruinedAt < 0 && eq <= acc.seed * a.ruinThreshold) { ruinedAt = i; break; }
    }
    while (equity.length < candles.length) equity.push(equity[equity.length - 1] ?? acc.seed);
    return finish(acc, candles, equity, trades, ruinedAt, marks, {
      baseNotional, stuckBars: stuck, maxStepReached: step,
      exposureAvg: expN ? expSum / expN : 0, exposureMax: expMax, partialExits: partials,
    });
  },
};

// ─────────────────────────────────────────────── 그리드

export const grid = {
  key: 'grid',
  name: 'Grid',
  family: 'position',
  blurb: 'Buy the dips, sell the bounces inside a fixed band. Profitable in range, bleeds when the band breaks.',
  defaults: { rangePct: 0.25, levels: 10, allocPct: 0.08 },
  sweep: { levels: [5, 10, 20, 30], rangePct: [0.15, 0.25, 0.40, 0.60] },
  run(candles, p, a = DEFAULT_ASSUMPTIONS) {
    const acc = new Account(a.seed, a);
    if (!candles.length) return finish(acc, candles, [], [], -1, []);
    const anchor = candles[0].close;
    const lo = anchor * (1 - p.rangePct), hi = anchor * (1 + p.rangePct);
    const stepPx = (hi - lo) / p.levels;
    const held = new Array(p.levels).fill(null); // level -> {units, cost}
    const equity = [], trades = [], marks = [];
    const notional = a.seed * p.allocPct;
    let ruinedAt = -1;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const open = !p.__gate || p.__gate(i);
      for (let L = 0; L < p.levels; L++) {
        const buyPx = lo + stepPx * L;
        const sellPx = buyPx + stepPx;
        if (!held[L] && open && c.low <= buyPx && buyPx <= anchor * 3) {   // open: filter(__gate) 가 참일 때만 새 칸을 산다 (10-22). 파는 건 늘
          const f = acc.buy(buyPx, notional);
          if (f) { held[L] = { units: f.units, cost: f.cost, i, px: f.px }; marks.push({ i, time: c.time, side: 'buy', level: L, price: f.px }); }
        } else if (held[L] && c.high >= sellPx) {
          const px = sellPx * (1 - a.slipRate);
          const net = held[L].units * px * (1 - a.feeRate);
          acc.cash += net; acc.units -= held[L].units; acc.deployed -= notional;
          trades.push({
            openIndex: held[L].i, closeIndex: i,
            openTime: candles[held[L].i].time, closeTime: c.time, time: c.time,
            entryPrice: held[L].px, exitPrice: px, notional: held[L].cost,
            level: L, bars: i - held[L].i, pnl: net - held[L].cost,
          });
          marks.push({ i, time: c.time, side: 'sell', level: L, price: px });
          held[L] = null;
        }
      }
      const eq = acc.equity(c.close);
      equity.push(eq);
      if (ruinedAt < 0 && eq <= acc.seed * a.ruinThreshold) { ruinedAt = i; break; }
    }
    while (equity.length < candles.length) equity.push(equity[equity.length - 1] ?? acc.seed);
    return finish(acc, candles, equity, trades, ruinedAt, marks, { baseNotional: notional, band: { lo, hi } });
  },
};

// ─────────────────────────────────────────────── DCA (벤치마크)

export const dca = {
  key: 'dca',
  name: 'DCA',
  family: 'position',
  blurb: 'Buy a fixed amount on a fixed schedule, never sell. The baseline every other strategy must beat.',
  defaults: { intervalBars: 7, amountPct: 0.02 },
  sweep: { intervalBars: [1, 7, 14, 30], amountPct: [0.01, 0.02, 0.05, 0.10] },
  run(candles, p, a = DEFAULT_ASSUMPTIONS) {
    const acc = new Account(a.seed, a);
    const notional = a.seed * p.amountPct;
    const equity = [], trades = [], marks = [];
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (i % p.intervalBars === 0 && (!p.__gate || p.__gate(i))) {   // filter 가 거짓인 정기일은 건너뛴다 (10-22 조건부 적립)
        const f = acc.buy(c.close, notional);
        if (f) marks.push({ i, time: c.time, side: 'buy', price: f.px });
      }
      equity.push(acc.equity(c.close));
    }
    // DCA 는 청산하지 않는다 — 마지막 평가액이 결과다
    return finish(acc, candles, equity, trades, -1, marks, { baseNotional: notional });
  },
};

// ─────────────────────────────────────────────── 매수 후 보유 (기준선)
//
// 이 사이트의 모든 숫자가 비교돼야 하는 대상. 첫 봉에 전액 사서 끝까지 든다.
// "그냥 사두는 것보다 나았는가" 가 사람이 실제로 묻는 질문이다.

export const buyhold = {
  key: 'buyhold', name: 'Buy & Hold', family: 'baseline',
  blurb: 'Buy once on the first bar and never touch it. The benchmark every other strategy on this site is measured against.',
  defaults: {},
  sweep: null,
  run(candles, p, a = DEFAULT_ASSUMPTIONS) {
    const acc = new Account(a.seed, a);
    if (!candles.length) return finish(acc, candles, [], [], -1, []);
    const equity = [], marks = [];
    const f = acc.buy(candles[0].open, a.seed / (1 + a.feeRate));
    if (f) marks.push({ i: 0, time: candles[0].time, side: 'buy', price: f.px });
    for (const c of candles) equity.push(acc.equity(c.close));
    return finish(acc, candles, equity, [], -1, marks, { baseNotional: a.seed });
  },
};

export const STRATEGIES = { buyhold, martingale, grid, dca };

// ─────────────────────────────────────────────── 시작 시점 스윕

/**
 * 시작 시점을 옮겨가며 같은 전략을 돌린다.
 * 단일 수익률은 시작 시점 하나를 고른 결과일 뿐이다 — 파산확률과 분포는 여기서 나온다.
 */
export function rollingStarts(strategy, candles, params, { window, stride, assumptions = DEFAULT_ASSUMPTIONS }) {
  const runs = [];
  for (let s = 0; s + window <= candles.length; s += stride) {
    const slice = candles.slice(s, s + window);
    const r = strategy.run(slice, params, assumptions);
    runs.push({
      startIndex: s,
      from: slice[0].time,
      to: slice[slice.length - 1].time,
      totalReturn: r.totalReturn,
      ruined: r.ruined,
      mdd: null, // 호출부에서 maxDrawdown 으로 채운다
      equity: r.equity,
      trades: r.trades.length,
    });
  }
  return runs;
}
