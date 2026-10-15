// /assets/js/app/chart/indicators.js
// Steadytrade Indicators Registry (UI schema + calculators)

export const Helpers = {
  sma(arr, period) {
    period = Math.max(1, period|0);
    const n = arr?.length|0;
    const out = new Array(n).fill(null);
    if (!n || period <= 0) return out;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      if (Number.isFinite(v)) sum += v;
      if (i >= period) {
        const old = arr[i - period];
        if (Number.isFinite(old)) sum -= old;
      }
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  },
  ema(arr, period) {
    period = Math.max(1, period|0);
    const n = arr?.length|0;
    const out = new Array(n).fill(null);
    if (!n || period <= 0) return out;
    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period && i < n; i++) {
      const v = arr[i];
      sum += Number.isFinite(v) ? v : 0;
    }
    if (n >= period) {
      out[period - 1] = sum / period;
      for (let i = period; i < n; i++) {
        const v = arr[i];
        const prev = out[i - 1] ?? v;
        out[i] = (v - prev) * k + prev;
      }
    }
    return out;
  },
  stdev(arr, period) {
    period = Math.max(1, period|0);
    const n = arr?.length|0;
    const out = new Array(n).fill(null);
    if (!n || period <= 0) return out;
    let sum = 0, sumSq = 0;
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      if (Number.isFinite(v)) {
        sum += v;
        sumSq += v * v;
      }
      if (i >= period) {
        const old = arr[i - period];
        if (Number.isFinite(old)) {
          sum -= old;
          sumSq -= old * old;
        }
      }
      if (i >= period - 1) {
        const mean = sum / period;
        const variance = Math.max(0, (sumSq / period) - mean * mean);
        out[i] = Math.sqrt(variance);
      }
    }
    return out;
  },
  rma(arr, period) {
    period = Math.max(1, period|0);
    const n = arr?.length|0;
    const out = new Array(n).fill(null);
    if (!n || period <= 0) return out;
    let sum = 0;
    for (let i = 0; i < period && i < n; i++) {
      const v = arr[i];
      sum += Number.isFinite(v) ? v : 0;
    }
    if (n >= period) {
      out[period - 1] = sum / period;
      const alpha = 1 / period;
      for (let i = period; i < n; i++) {
        const v = arr[i];
        const prev = out[i - 1] ?? v;
        out[i] = prev + alpha * (v - prev);
      }
    }
    return out;
  },
  // RSI 계산 (candles 배열과 period를 받아 RSI 배열 반환)
  rsi(candles, period = 14) {
    period = Math.max(1, period|0);
    const n = candles?.length|0;
    const out = new Array(n).fill(null);
    if (!n || period <= 0) return out;

    // gains/losses 계산
    const gains = new Array(n).fill(0);
    const losses = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      const diff = candles[i].close - candles[i-1].close;
      gains[i] = diff > 0 ? diff : 0;
      losses[i] = diff < 0 ? -diff : 0;
    }

    // RMA로 평균 계산
    const avgGain = this.rma(gains, period);
    const avgLoss = this.rma(losses, period);

    // RSI 계산
    for (let i = 0; i < n; i++) {
      const g = avgGain[i];
      const l = avgLoss[i];
      if (g === null || l === null) continue;
      if (l === 0 && g === 0) {
        out[i] = 50;
      } else if (l === 0) {
        out[i] = 100;
      } else {
        out[i] = 100 - (100 / (1 + g / l));
      }
    }
    return out;
  },
  // ATR (Average True Range) - candles 배열 필요
  atr(candles, period = 14) {
    period = Math.max(1, period|0);
    const n = candles?.length|0;
    if (!n || period <= 0) return new Array(n).fill(null);
    const tr = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (i === 0) { tr[i] = candles[i].high - candles[i].low; continue; }
      const pc = candles[i-1].close;
      tr[i] = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - pc),
        Math.abs(candles[i].low - pc)
      );
    }
    return this.rma(tr, period);
  },
  // WMA (Weighted Moving Average)
  wma(arr, period) {
    period = Math.max(1, period|0);
    const n = arr?.length|0;
    const out = new Array(n).fill(null);
    if (!n || period <= 0) return out;
    const denom = period * (period + 1) / 2;
    for (let i = period - 1; i < n; i++) {
      let sum = 0, valid = true;
      for (let j = 0; j < period; j++) {
        const v = arr[i - period + 1 + j];
        if (!Number.isFinite(v)) { valid = false; break; }
        sum += v * (j + 1);
      }
      out[i] = valid ? sum / denom : null;
    }
    return out;
  },
  // HMA (Hull Moving Average) - 노이즈 감소, 빠른 반응
  hma(arr, period) {
    period = Math.max(2, period|0);
    const half = Math.max(1, Math.floor(period / 2));
    const sqrtP = Math.max(1, Math.round(Math.sqrt(period)));
    const wmaHalf = this.wma(arr, half);
    const wmaFull = this.wma(arr, period);
    const n = arr?.length|0;
    const diff = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (wmaHalf[i] != null && wmaFull[i] != null) {
        diff[i] = 2 * wmaHalf[i] - wmaFull[i];
      }
    }
    return this.wma(diff, sqrtP);
  },
};

// ========= Param utilities =========
export function normalizeParams(schemaInputs, raw = {}) {
  const out = {};
  for (const inp of (schemaInputs || [])) {
    const t = (inp.type || 'number'); // 'number' | 'select' | 'text' ...
    let val = raw[inp.name];

    // 기본값 보정
    if (val == null) val = inp.default;

    if (t === 'number') {
      // 숫자만 숫자로 캐스팅
      val = +val;
      if (Number.isNaN(val)) val = +inp.default;
      if (inp.min != null) val = Math.max(inp.min, val);
      if (inp.max != null) val = Math.min(inp.max, val);
    } else {
      // select/text 등은 문자열 유지
      val = (val != null) ? String(val) : String(inp.default);
    }

    out[inp.name] = val;
  }
  return out;
}
export function getDefaultParams(schemaInputs) {
  const out = {};
  for (const inp of (schemaInputs || [])) out[inp.name] = inp.default;
  return out;
}

// ========= Indicators Registry =========
export const Indicators = {
  // ----- SMA -----
  sma: {
    key: 'sma',
    name: 'SMA Ribone',
    group: 'trend',
    defaultVisible: true,
    inputs: [
      { name:'fast', label:'빠른 기간', type:'number', default:14, min:1, max:1000, step:1 },
      { name:'slow', label:'느린 기간', type:'number', default:28, min:1, max:1000, step:1 },
    ],
    outputs: [
      // ✅ 기본 색상 포함
      { name:'fast', label:'SMA Fast', kind:'line', decimals:2, color:'#0ea5e9' }, // sky-500
      { name:'slow', label:'SMA Slow', kind:'line', decimals:2, color:'#64748b' }, // slate-500
    ],
    calc(candles, params, H = Helpers) {
      const closes = candles.map(c => c.close);
      const fast = H.sma(closes, params.fast);
      const slow = H.sma(closes, params.slow);
      return { fast, slow };
    },
  },

  // ----- EMA -----
  ema: {
    key: 'ema',
    name: 'EMA Ribone',
    group: 'trend',
    inputs: [
      { name:'fast', label:'빠른 기간', type:'number', default:12, min:1, max:1000, step:1 },
      { name:'slow', label:'느린 기간', type:'number', default:26, min:1, max:1000, step:1 },
    ],
    outputs: [
      { name:'fast', label:'EMA Fast', kind:'line', decimals:2, color:'#22c55e' }, // green-500
      { name:'slow', label:'EMA Slow', kind:'line', decimals:2, color:'#f59e0b' }, // amber-500
    ],
    calc(candles, params, H = Helpers) {
      const closes = candles.map(c => c.close);
      const fast = H.ema(closes, params.fast);
      const slow = H.ema(closes, params.slow);
      return { fast, slow };
    },
  },

  // ----- Bollinger Bands -----
  bb: {
    key: 'bb',
    name: 'Bollinger Bands',
    group: 'volatility',
    inputs: [
      { name:'length', label:'기간', type:'number', default:20, min:2, max:1000, step:1 },
      { name:'mult',   label:'배수', type:'number', default:2,  min:0.1, max:10, step:0.1 },
    ],
    outputs: [
      { name:'upper', label:'Upper', kind:'line', decimals:2, color:'#8b5cf6' }, // violet-500
      { name:'basis', label:'Basis', kind:'line', decimals:2, color:'#94a3b8' }, // slate-400
      { name:'lower', label:'Lower', kind:'line', decimals:2, color:'#ef4444' }, // red-500
    ],
    calc(candles, p, H = Helpers) {
      const close = candles.map(c => c.close);
      const basis = H.sma(close, p.length);
      const stdev = H.stdev(close, p.length);
      const upper = basis.map((b, i) => (b != null && stdev[i] != null) ? b + p.mult * stdev[i] : null);
      const lower = basis.map((b, i) => (b != null && stdev[i] != null) ? b - p.mult * stdev[i] : null);
      return { upper, basis, lower };
    },
  },

  // ----- RSI -----
  rsi: {
    key: 'rsi',
    name: 'RSI',
    pane: 'sub',
    group: 'momentum',
    defaultVisible: true,
    inputs: [
      { name:'length', label:'기간',   type:'number', default:14, min:2, max:300, step:1 },
      { name:'ma',     label:'RSI MA', type:'number', default:9,  min:1, max:300, step:1 },
    ],
    outputs: [
      { name:'value',  label:'RSI',    kind:'line', unit:null, decimals:2, color:'#3b82f6' }, // blue-500
      { name:'rsi_ma', label:'RSI MA', kind:'line', unit:null, decimals:2, color:'#f97316' }, // orange-500
    ],
    calc(candles, p, H = Helpers) {
      const n = candles.length;
      const out = new Array(n).fill(null);
      if (n < 2) return { value: out, rsi_ma: out.slice() };

      const gains = new Array(n).fill(null);
      const losses = new Array(n).fill(null);
      for (let i = 1; i < n; i++) {
        const diff = candles[i].close - candles[i - 1].close;
        gains[i] = diff > 0 ? diff : 0;
        losses[i] = diff < 0 ? -diff : 0;
      }
      const avgG = H.rma(gains, p.length);
      const avgL = H.rma(losses, p.length);

      for (let i = 0; i < n; i++) {
        const g = avgG[i], l = avgL[i];
        if (!Number.isFinite(g) || !Number.isFinite(l) || l === 0 && g === 0) {
          out[i] = null;
        } else if (l === 0) {
          out[i] = 100;
        } else {
          const rs = g / l;
          out[i] = 100 - (100 / (1 + rs));
        }
      }

      const rsi_ma = (p.ma && p.ma > 1) ? Helpers.sma(out, p.ma) : new Array(n).fill(null);
      return { value: out, rsi_ma };
    },
  },

  // ----- MACD -----
  macd: {
    key: 'macd',
    name: 'MACD',
    pane: 'sub',
    group: 'momentum',
    inputs: [
      { name:'fast',   label:'빠른 EMA', type:'number', default:12, min:1, max:500, step:1 },
      { name:'slow',   label:'느린 EMA', type:'number', default:26, min:1, max:500, step:1 },
      { name:'signal', label:'시그널',   type:'number', default:9,  min:1, max:500, step:1 },
    ],
    outputs: [
      { name:'macd',      label:'MACD',      kind:'line', decimals:4, color:'#10b981' }, // emerald-500
      { name:'signal',    label:'Signal',    kind:'line', decimals:4, color:'#ef4444' }, // red-500
      { name:'histogram', label:'Histogram', kind:'hist', decimals:4 },                  // 색은 히스토그램 그릴 때 부호별로 지정
    ],
    calc(candles, p, H = Helpers) {
      const closes = candles.map(c => c.close);
      const emaFast = H.ema(closes, p.fast);
      const emaSlow = H.ema(closes, p.slow);

      const n = closes.length;
      const macd = new Array(n).fill(null);
      for (let i = 0; i < n; i++) {
        if (emaFast[i] != null && emaSlow[i] != null) {
          macd[i] = emaFast[i] - emaSlow[i];
        }
      }

      // ✅ 유효 MACD가 시작되는 시점부터 EMA 계산
      const signal = new Array(n).fill(null);
      const firstIdx = macd.findIndex(v => Number.isFinite(v));
      if (firstIdx !== -1) {
        const emaInput = macd.slice(firstIdx);
        const emaSlice = H.ema(emaInput, p.signal);
        for (let i = 0; i < emaSlice.length; i++) {
          signal[firstIdx + i] = emaSlice[i];
        }
      }

      const histogram = macd.map((m, i) =>
        (m != null && signal[i] != null) ? (m - signal[i]) : null
      );

      return { macd, signal, histogram };
    },
  },

  // ----- Parabolic SAR -----
  sar: {
    key: 'sar',
    name: 'Parabolic SAR',
    group: 'trend',
    inputs: [
      { name:'step', label:'AF Step', type:'number', default:0.02, min:0.001, max:1.0, step:0.001 },
      { name:'max',  label:'AF Max',  type:'number', default:0.2,  min:0.01,  max:1.0, step:0.01  },
    ],
    outputs: [
      { name:'value', label:'SAR', kind:'dots', decimals:2, color:'#6b7280' }, // gray-500
    ],
    calc(candles, p) {
      const n = candles.length;
      const out = new Array(n).fill(null);
      if (n < 2) return { value: out };

      let af = p.step;
      const afMax = p.max;
      let uptrend;

      if (candles[1].high > candles[0].high) {
        uptrend = true;
        out[1] = candles[0].low;
      } else {
        uptrend = false;
        out[1] = candles[0].high;
      }
      let ep = uptrend ? Math.max(candles[0].high, candles[1].high)
                       : Math.min(candles[0].low,  candles[1].low);

      for (let i = 2; i < n; i++) {
        let sar = out[i - 1] + af * (ep - out[i - 1]);

        if (uptrend) {
          sar = Math.min(sar, candles[i - 1].low, candles[i - 2].low);
        } else {
          sar = Math.max(sar, candles[i - 1].high, candles[i - 2].high);
        }

        if (uptrend) {
          if (candles[i].low < sar) {
            uptrend = false;
            sar = ep;
            ep = candles[i].low;
            af = p.step;
          } else {
            if (candles[i].high > ep) {
              ep = candles[i].high;
              af = Math.min(af + p.step, afMax);
            }
          }
        } else {
          if (candles[i].high > sar) {
            uptrend = true;
            sar = ep;
            ep = candles[i].high;
            af = p.step;
          } else {
            if (candles[i].low < ep) {
              ep = candles[i].low;
              af = Math.min(af + p.step, afMax);
            }
          }
        }

        out[i] = sar;
      }

      return { value: out };
    },
  },
// ----- Stochastic -----
stoch: {
  key: 'stoch',
  name: 'Stochastic',
  pane: 'sub',
  group: 'momentum',
  defaultVisible: false,
  inputs: [
    { name:'k', label:'%K 기간', type:'number', default:14, min:2, max:300, step:1 },
    { name:'d', label:'%D 기간', type:'number', default:3,  min:1, max:100, step:1 },
    { name:'smoothK', label:'%K 스무딩', type:'number', default:1, min:1, max:10, step:1 },
  ],
  outputs: [
    { name:'k', label:'%K', kind:'line', decimals:2, color:'#22c55e' },
    { name:'d', label:'%D', kind:'line', decimals:2, color:'#ef4444' },
  ],
  calc(candles, p, H = Helpers) {
    const n = candles.length;
    const kArr = new Array(n).fill(null);
    const dArr = new Array(n).fill(null);

    const highs = candles.map(c=>c.high);
    const lows  = candles.map(c=>c.low);
    const close = candles.map(c=>c.close);

    const lenK = Math.max(2, p.k|0);
    const smoothK = Math.max(1, p.smoothK|0);
    const lenD = Math.max(1, p.d|0);

    // 롤링 최댓/최솟
    function rollingMin(arr, win){
      const out=new Array(arr.length).fill(null);
      for(let i=0;i<arr.length;i++){
        if(i+1<win) continue;
        let m=Infinity;
        for(let j=i-win+1;j<=i;j++) if(arr[j]<m) m=arr[j];
        out[i]=m;
      }
      return out;
    }
    function rollingMax(arr, win){
      const out=new Array(arr.length).fill(null);
      for(let i=0;i<arr.length;i++){
        if(i+1<win) continue;
        let m=-Infinity;
        for(let j=i-win+1;j<=i;j++) if(arr[j]>m) m=arr[j];
        out[i]=m;
      }
      return out;
    }

    const ll = rollingMin(lows, lenK);
    const hh = rollingMax(highs, lenK);

    const rawK = new Array(n).fill(null);
    for(let i=0;i<n;i++){
      const L=ll[i], Hh=hh[i], C=close[i];
      if(L==null || Hh==null || !Number.isFinite(C) || Hh===L) continue;
      rawK[i] = 100 * (C - L) / (Hh - L);
    }

    // %K 스무딩(SMA smoothK)
    const smoothKArr = (smoothK>1) ? H.sma(rawK, smoothK) : rawK;

    // %D = SMA(%K, lenD)
    const dLine = (lenD>1) ? H.sma(smoothKArr, lenD) : smoothKArr;

    for(let i=0;i<n;i++){
      kArr[i] = Number.isFinite(smoothKArr[i]) ? smoothKArr[i] : null;
      dArr[i] = Number.isFinite(dLine[i]) ? dLine[i] : null;
    }
    return { k: kArr, d: dArr };
  },
},
// ----- ADX -----
adx: {
  key: 'adx',
  name: 'ADX',
  pane: 'sub',
  group: 'trend',
  defaultVisible: false,
  inputs: [
    { name:'length', label:'기간', type:'number', default:14, min:2, max:300, step:1 },
  ],
  outputs: [
    { name:'pdi', label:'+DI', kind:'line', decimals:2, color:'#16a34a' },  // green-600
    { name:'mdi', label:'-DI', kind:'line', decimals:2, color:'#ef4444' },  // red-500
    { name:'adx', label:'ADX', kind:'line', decimals:2, color:'#0ea5e9' },  // sky-500
  ],
  calc(candles, p, H = Helpers) {
    const n = candles.length;
    const len = Math.max(2, p.length|0);

    const high = candles.map(c=>c.high);
    const low  = candles.map(c=>c.low);
    const close= candles.map(c=>c.close);

    const tr = new Array(n).fill(null);
    const plusDM  = new Array(n).fill(0);
    const minusDM = new Array(n).fill(0);

    for(let i=1;i<n;i++){
      const upMove   = high[i] - high[i-1];
      const downMove = low[i-1] - low[i];

      plusDM[i]  = (upMove > 0 && upMove > downMove) ? upMove : 0;
      minusDM[i] = (downMove > 0 && downMove > upMove) ? downMove : 0;

      const h_l = high[i]-low[i];
      const h_pc= Math.abs(high[i]-close[i-1]);
      const l_pc= Math.abs(low[i]-close[i-1]);
      tr[i] = Math.max(h_l, h_pc, l_pc);
    }

    // ATR = RMA(TR, len)
    const atr = H.rma(tr, len);

    // +DI, -DI
    const pdi = new Array(n).fill(null);
    const mdi = new Array(n).fill(null);
    const smPlusDM  = H.rma(plusDM, len);
    const smMinusDM = H.rma(minusDM, len);

    for(let i=0;i<n;i++){
      if(!Number.isFinite(atr[i]) || atr[i]===0){
        pdi[i]=mdi[i]=null; continue;
      }
      pdi[i] = 100 * (smPlusDM[i] / atr[i]);
      mdi[i] = 100 * (smMinusDM[i] / atr[i]);
    }

    // DX = 100 * |pdi - mdi| / (pdi + mdi), ADX = RMA(DX, len)
    const dx = new Array(n).fill(null);
    for(let i=0;i<n;i++){
      const a=pdi[i], b=mdi[i];
      if(!Number.isFinite(a)||!Number.isFinite(b)|| (a+b)===0){ dx[i]=null; continue; }
      dx[i] = 100 * Math.abs(a - b) / (a + b);
    }
    const adx = H.rma(dx, len);

    return { pdi, mdi, adx };
  },
},

// ----- Donchian Channels -----
donchian: {
  key: 'donchian',
  name: 'Donchian Channels',
  group: 'volatility',
  defaultVisible: false,
  inputs: [
    { name:'length', label:'기간', type:'number', default:20, min:2, max:1000, step:1 },
  ],
  outputs: [
    { name:'upper', label:'Upper', kind:'line', decimals:2, color:'#ef4444' },
    { name:'middle', label:'Middle', kind:'line', decimals:2, color:'#94a3b8' },
    { name:'lower', label:'Lower', kind:'line', decimals:2, color:'#3b82f6' },
  ],
  calc(candles, p, H = Helpers) {
    const n=candles.length, L=Math.max(2, p.length|0);
    const highs=candles.map(c=>c.high), lows=candles.map(c=>c.low);

    const upper=new Array(n).fill(null);
    const lower=new Array(n).fill(null);
    const middle=new Array(n).fill(null);

    for(let i=0;i<n;i++){
      if(i+1<L) continue;
      let hi=-Infinity, lo=Infinity;
      for(let j=i-L+1;j<=i;j++){
        if(highs[j]>hi) hi=highs[j];
        if(lows[j] <lo) lo=lows[j];
      }
      upper[i]=Number.isFinite(hi)?hi:null;
      lower[i]=Number.isFinite(lo)?lo:null;
      middle[i]=(upper[i]!=null && lower[i]!=null)? (upper[i]+lower[i])/2 : null;
    }
    return { upper, middle, lower };
  },
},

// ----- Supertrend (TradingView) -----
supertrend: {
  key: 'supertrend',
  name: 'Supertrend',
  group: 'trend',
  defaultVisible: false,
  inputs: [
    { name:'length', label:'ATR 기간', type:'number', default:10, min:1, max:500, step:1 },
    { name:'mult',   label:'배수',     type:'number', default:3,  min:0.1, max:20, step:0.1 },
  ],
  outputs: [
    // coloredDots: 점마다 색상 다름, 수직선 문제 없음
    { name:'line', label:'Supertrend', kind:'coloredDots', decimals:2, dotSize: 3 },
  ],
  calc(candles, p, H = Helpers) {
    const n = candles.length;
    const len = Math.max(1, p.length|0);
    const mult = p.mult || 3;

    const COLOR_UP = '#22c55e';    // green-500
    const COLOR_DOWN = '#ef4444';  // red-500

    // 결과: { value, color } 배열
    const line = new Array(n).fill(null);

    if (n < 2) return { line };

    // 1. True Range 계산
    const tr = new Array(n).fill(null);
    for (let i = 1; i < n; i++) {
      const h = candles[i].high;
      const l = candles[i].low;
      const pc = candles[i - 1].close;
      tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }

    // 2. ATR 계산 (RMA)
    const atr = H.rma(tr, len);

    // 3. HL2 (중간가)
    const hl2 = candles.map(c => (c.high + c.low) / 2);

    // 4. Basic Upper/Lower Bands
    const basicUp   = new Array(n).fill(null);
    const basicDown = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (atr[i] != null) {
        basicUp[i]   = hl2[i] - mult * atr[i];
        basicDown[i] = hl2[i] + mult * atr[i];
      }
    }

    // 5. Final Upper/Lower Bands (with trailing logic)
    const finalUp   = new Array(n).fill(null);
    const finalDown = new Array(n).fill(null);
    const supertrend = new Array(n).fill(null);
    const direction  = new Array(n).fill(1); // 1 = uptrend, -1 = downtrend

    for (let i = 0; i < n; i++) {
      if (basicUp[i] == null || basicDown[i] == null) continue;

      // Final Upper Band
      if (i === 0 || finalUp[i - 1] == null) {
        finalUp[i] = basicUp[i];
      } else {
        finalUp[i] = (basicUp[i] > finalUp[i - 1] || candles[i - 1].close < finalUp[i - 1])
          ? basicUp[i]
          : finalUp[i - 1];
      }

      // Final Lower Band
      if (i === 0 || finalDown[i - 1] == null) {
        finalDown[i] = basicDown[i];
      } else {
        finalDown[i] = (basicDown[i] < finalDown[i - 1] || candles[i - 1].close > finalDown[i - 1])
          ? basicDown[i]
          : finalDown[i - 1];
      }

      // Direction & Supertrend
      if (i === 0) {
        direction[i] = 1;
        supertrend[i] = finalUp[i];
      } else {
        const prevDir = direction[i - 1];

        if (prevDir === 1) {
          if (candles[i].close < finalUp[i]) {
            direction[i] = -1;
            supertrend[i] = finalDown[i];
          } else {
            direction[i] = 1;
            supertrend[i] = finalUp[i];
          }
        } else {
          if (candles[i].close > finalDown[i]) {
            direction[i] = 1;
            supertrend[i] = finalUp[i];
          } else {
            direction[i] = -1;
            supertrend[i] = finalDown[i];
          }
        }
      }
    }

    // 6. 출력 생성: 값 + 색상 (dots 방식이라 전환 지점도 그냥 표시)
    for (let i = 0; i < n; i++) {
      if (supertrend[i] == null) {
        line[i] = null;
        continue;
      }

      line[i] = {
        value: supertrend[i],
        color: direction[i] === 1 ? COLOR_UP : COLOR_DOWN
      };
    }

    return { line };
  },
},

};

// ==== Prev High/Low (전저/전고) =============================================
(function(){
  const DEF_COLOR_HIGH = '#ef4444'; // red-500
  const DEF_COLOR_LOW  = '#22c55e'; // green-500

  function computePrevHL(candles, params={}){
    const mode  = params.mode  || 'pivot';
    const len   = Math.max(1, params.len|0 || 20);
    const left  = Math.max(1, params.left|0 || 2);
    const right = Math.max(1, params.right|0 || 2);

    const n = Array.isArray(candles) ? candles.length : 0;
    const prevHigh = new Array(n).fill(null);
    const prevLow  = new Array(n).fill(null);

    if(n === 0) return { prevHigh, prevLow };

    if(mode === 'bar'){
      for(let i=1;i<n;i++){
        prevHigh[i] = +candles[i-1].high;
        prevLow[i]  = +candles[i-1].low;
      }
      return { prevHigh, prevLow };
    }

    if(mode === 'rolling'){
      for(let i=1;i<n;i++){
        const s = Math.max(0, i - len);
        let hi = -Infinity, lo = +Infinity;
        for(let k=s; k<i; k++){
          const h = +candles[k].high;
          const l = +candles[k].low;
          if(Number.isFinite(h) && h>hi) hi = h;
          if(Number.isFinite(l) && l<lo) lo = l;
        }
        prevHigh[i] = Number.isFinite(hi) ? hi : null;
        prevLow[i]  = Number.isFinite(lo) ? lo : null;
      }
      return { prevHigh, prevLow };
    }

    // pivot 모드
    let lastPH = null, lastPL = null;
    for(let i=0;i<n;i++){
      prevHigh[i] = lastPH;
      prevLow[i]  = lastPL;

      const iPivot = i - right;
      if(iPivot < left || i < (iPivot + right)) continue;

      let isPH = true, isPL = true;
      const h0 = +candles[iPivot].high;
      const l0 = +candles[iPivot].low;
      if(!Number.isFinite(h0) || !Number.isFinite(l0)) continue;

      for(let d=1; d<=left; d++){
        const hl = +candles[iPivot - d]?.high;
        const ll = +candles[iPivot - d]?.low;
        if(Number.isFinite(hl) && hl > h0) isPH = false;
        if(Number.isFinite(ll) && ll < l0) isPL = false;
      }
      for(let d=1; d<=right; d++){
        const hr = +candles[iPivot + d]?.high;
        const lr = +candles[iPivot + d]?.low;
        if(Number.isFinite(hr) && hr >= h0) isPH = false;
        if(Number.isFinite(lr) && lr <= l0) isPL = false;
      }

      if(isPH) lastPH = h0;
      if(isPL) lastPL = l0;

      prevHigh[i] = lastPH;
      prevLow[i]  = lastPL;
    }

    for(let i=1;i<n;i++){
      if(prevHigh[i]==null) prevHigh[i] = prevHigh[i-1];
      if(prevLow[i]==null)  prevLow[i]  = prevLow[i-1];
    }
    return { prevHigh, prevLow };
  }

  // ⬇⬇⬇ 여기부터 "스키마 규칙"에 맞게 정의 (name/default/kind 사용)
  const DEF = {
    key: 'prevhl',
    name: 'Prev High/Low (전고/전저)',
    group: 'levels',
    defaultVisible: false,
    inputs: [
      { name: 'mode',  label:'모드',  type: 'select',  default: 'pivot',
        options: [
          {label:'Pivot(피벗)', value:'pivot'},
          {label:'Rolling N',  value:'rolling'},
          {label:'Previous Bar',value:'bar'},
        ]
      },
      { name: 'len',   label:'N',     type: 'number',  default: 20, min:1, step:1 },   // rolling용
      { name: 'left',  label:'Left',  type: 'number',  default: 2,  min:1, step:1 },   // pivot용
      { name: 'right', label:'Right', type: 'number',  default: 2,  min:1, step:1 },
    ],
    outputs: [
      { name: 'prevHigh', label: '전고', kind: 'line', decimals:2, color: DEF_COLOR_HIGH },
      { name: 'prevLow',  label: '전저', kind: 'line', decimals:2, color: DEF_COLOR_LOW  },
    ],
    calc: (candles, params)=> computePrevHL(candles, params),
  };

  // 🔗 export된 Indicators 객체에 "직접" 등록 (runIndicator가 이걸 참조함)
  try {
    Indicators.prevhl = DEF;
  } catch(e){
    console.error('[prevhl] register failed:', e);
  }
})();


// ========= 추가 지표 (2026-10-08) — 차트 화면과 백테스트가 같은 계산을 쓴다 =========
(function addMore() {
  const src = (c, s) => (s === 'open' ? c.open : s === 'high' ? c.high : s === 'low' ? c.low : s === 'hl2' ? (c.high + c.low) / 2 : s === 'hlc3' ? (c.high + c.low + c.close) / 3 : c.close);
  const SRC = { name: 'source', label: '가격', type: 'select', default: 'close', options: [
    { value: 'close', label: '종가' }, { value: 'open', label: '시가' }, { value: 'high', label: '고가' }, { value: 'low', label: '저가' }, { value: 'hl2', label: '(고+저)/2' }, { value: 'hlc3', label: '(고+저+종)/3' }] };
  const nulls = (n) => new Array(n).fill(null);

  Object.assign(Indicators, {
    // 이동평균 하나 — 종류를 고른다 (SMA·EMA 리본과 따로, 원하는 기간 하나를 그릴 때)
    ma: {
      key: 'ma', name: 'Moving Average', group: 'trend', defaultVisible: false,
      inputs: [
        { name: 'type', label: '종류', type: 'select', default: 'ema', options: [{ value: 'sma', label: 'SMA' }, { value: 'ema', label: 'EMA' }, { value: 'wma', label: 'WMA' }, { value: 'hma', label: 'HMA' }] },
        { name: 'length', label: '기간', type: 'number', default: 200, min: 1, max: 1000, step: 1 },
        SRC,
      ],
      outputs: [{ name: 'value', label: 'MA', kind: 'line', decimals: 2, color: '#a855f7' }],
      calc(candles, p, H = Helpers) {
        const s = candles.map((c) => src(c, p.source));
        const f = { sma: H.sma, ema: H.ema, wma: H.wma, hma: H.hma }[p.type] ?? H.ema;
        return { value: f.call(H, s, p.length) };
      },
    },
    // 켈트너 채널 — EMA ± 배수 × ATR
    keltner: {
      key: 'keltner', name: 'Keltner Channels', group: 'volatility', defaultVisible: false,
      inputs: [
        { name: 'length', label: 'EMA 기간', type: 'number', default: 20, min: 2, max: 500, step: 1 },
        { name: 'atr', label: 'ATR 기간', type: 'number', default: 10, min: 1, max: 500, step: 1 },
        { name: 'mult', label: '배수', type: 'number', default: 2, min: 0.1, max: 10, step: 0.1 },
      ],
      outputs: [{ name: 'upper', label: '상단', kind: 'line', decimals: 2, color: '#06b6d4' }, { name: 'basis', label: '중심', kind: 'line', decimals: 2, color: '#94a3b8' }, { name: 'lower', label: '하단', kind: 'line', decimals: 2, color: '#06b6d4' }],
      calc(candles, p, H = Helpers) {
        const basis = H.ema(candles.map((c) => c.close), p.length);
        const atr = H.atr(candles, p.atr);
        return {
          basis,
          upper: basis.map((b, i) => (Number.isFinite(b) && Number.isFinite(atr[i]) ? b + p.mult * atr[i] : null)),
          lower: basis.map((b, i) => (Number.isFinite(b) && Number.isFinite(atr[i]) ? b - p.mult * atr[i] : null)),
        };
      },
    },
    // 거래량가중평균가 — 최근 N봉 (24시간 거래라 세션 경계 대신 굴리는 창)
    vwap: {
      key: 'vwap', name: 'VWAP (rolling)', group: 'volume', defaultVisible: false,
      inputs: [{ name: 'length', label: '기간(봉)', type: 'number', default: 20, min: 1, max: 1000, step: 1 }],
      outputs: [{ name: 'value', label: 'VWAP', kind: 'line', decimals: 2, color: '#0ea5e9' }],
      calc(candles, p) {
        const n = candles.length, out = nulls(n);
        let pv = 0, vv = 0;
        for (let i = 0; i < n; i++) {
          const c = candles[i], v = Number(c.volume) || 0;
          pv += ((c.high + c.low + c.close) / 3) * v; vv += v;
          if (i >= p.length) { const o = candles[i - p.length], ov = Number(o.volume) || 0; pv -= ((o.high + o.low + o.close) / 3) * ov; vv -= ov; }
          if (i >= p.length - 1 && vv > 0) out[i] = pv / vv;
        }
        return { value: out };
      },
    },
    atr: {
      key: 'atr', name: 'ATR', pane: 'sub', group: 'volatility', defaultVisible: false,
      inputs: [{ name: 'length', label: '기간', type: 'number', default: 14, min: 1, max: 500, step: 1 }],
      outputs: [{ name: 'value', label: 'ATR', kind: 'line', decimals: 4, color: '#f59e0b' }],
      calc(candles, p, H = Helpers) { return { value: H.atr(candles, p.length) }; },
    },
    cci: {
      key: 'cci', name: 'CCI', pane: 'sub', group: 'momentum', defaultVisible: false,
      inputs: [{ name: 'length', label: '기간', type: 'number', default: 20, min: 2, max: 500, step: 1 }],
      outputs: [{ name: 'value', label: 'CCI', kind: 'line', decimals: 2, color: '#14b8a6' }],
      levels: [100, -100],
      calc(candles, p, H = Helpers) {
        const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
        const ma = H.sma(tp, p.length), n = tp.length, out = nulls(n);
        for (let i = p.length - 1; i < n; i++) {
          let md = 0;
          for (let j = i - p.length + 1; j <= i; j++) md += Math.abs(tp[j] - ma[i]);
          md /= p.length;
          out[i] = md ? (tp[i] - ma[i]) / (0.015 * md) : 0;
        }
        return { value: out };
      },
    },
    willr: {
      key: 'willr', name: 'Williams %R', pane: 'sub', group: 'momentum', defaultVisible: false,
      inputs: [{ name: 'length', label: '기간', type: 'number', default: 14, min: 2, max: 500, step: 1 }],
      outputs: [{ name: 'value', label: '%R', kind: 'line', decimals: 2, color: '#8b5cf6' }],
      levels: [-20, -80],
      calc(candles, p) {
        const n = candles.length, out = nulls(n);
        for (let i = p.length - 1; i < n; i++) {
          let hi = -Infinity, lo = Infinity;
          for (let j = i - p.length + 1; j <= i; j++) { hi = Math.max(hi, candles[j].high); lo = Math.min(lo, candles[j].low); }
          out[i] = hi > lo ? ((hi - candles[i].close) / (hi - lo)) * -100 : 0;
        }
        return { value: out };
      },
    },
    obv: {
      key: 'obv', name: 'OBV', pane: 'sub', group: 'volume', defaultVisible: false,
      inputs: [{ name: 'ma', label: 'OBV 평균 기간', type: 'number', default: 20, min: 1, max: 500, step: 1 }],
      outputs: [{ name: 'value', label: 'OBV', kind: 'line', decimals: 0, color: '#0ea5e9' }, { name: 'obv_ma', label: 'OBV MA', kind: 'line', decimals: 0, color: '#f97316' }],
      calc(candles, p, H = Helpers) {
        const n = candles.length, out = nulls(n);
        let acc = 0;
        for (let i = 0; i < n; i++) {
          if (i > 0) { const d = candles[i].close - candles[i - 1].close, v = Number(candles[i].volume) || 0; acc += d > 0 ? v : d < 0 ? -v : 0; }
          out[i] = acc;
        }
        return { value: out, obv_ma: p.ma > 1 ? H.sma(out, p.ma) : nulls(n) };
      },
    },
    mfi: {
      key: 'mfi', name: 'MFI', pane: 'sub', group: 'volume', defaultVisible: false,
      inputs: [{ name: 'length', label: '기간', type: 'number', default: 14, min: 2, max: 500, step: 1 }],
      outputs: [{ name: 'value', label: 'MFI', kind: 'line', decimals: 2, color: '#22c55e' }],
      levels: [80, 20],
      calc(candles, p) {
        const n = candles.length, out = nulls(n);
        const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
        for (let i = p.length; i < n; i++) {
          let pos = 0, neg = 0;
          for (let j = i - p.length + 1; j <= i; j++) {
            const mf = tp[j] * (Number(candles[j].volume) || 0);
            if (tp[j] > tp[j - 1]) pos += mf; else if (tp[j] < tp[j - 1]) neg += mf;
          }
          out[i] = neg === 0 ? (pos === 0 ? 50 : 100) : 100 - 100 / (1 + pos / neg);
        }
        return { value: out };
      },
    },
    roc: {
      key: 'roc', name: 'ROC', pane: 'sub', group: 'momentum', defaultVisible: false,
      inputs: [{ name: 'length', label: '기간', type: 'number', default: 12, min: 1, max: 500, step: 1 }],
      outputs: [{ name: 'value', label: 'ROC %', kind: 'line', decimals: 2, color: '#ef4444' }],
      levels: [0],
      calc(candles, p) {
        const n = candles.length, out = nulls(n);
        for (let i = p.length; i < n; i++) { const b = candles[i - p.length].close; out[i] = b ? ((candles[i].close - b) / b) * 100 : null; }
        return { value: out };
      },
    },
  });
})();


// ========= Runner =========
export function runIndicator(key, candles, rawParams) {
  const def = Indicators[key];
  if (!def) throw new Error(`Indicator not found: ${key}`);
  const params = normalizeParams(def.inputs, rawParams);
  return def.calc(candles || [], params, Helpers);
}

export default Indicators;
