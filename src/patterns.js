// 차트 패턴 찾기 (10-15) — 삼각수렴·쐐기·채널·박스·이중/삼중 천장·바닥·헤드앤숄더(역).
// 화면(chart-pat.js)과 서버(과거 성적·보고서 도구)가 같이 쓴다 — DOM·네트워크 없음, 봉 배열만 받는다.
//   bars: [{ time, open, high, low, close }] (오래된 것부터)   step: 봉 길이(초) — 선을 오른쪽 미래로 늘릴 때
// 방법: ① 변동성(ATR) 대비 민감도 3단계로 고점·저점(zigzag) ② 최근 꼭짓점 4~7개 창마다 고점선·저점선 맞춤 ③ 기울기·폭 변화로 모양 구분
//       ④ 민감도 단계끼리 같은 패턴이면 하나로(일치한 단계 수 = 신뢰 가점) ⑤ 지금 진행 중이거나 막 돌파한 것만
// 패턴은 보는 사람마다 다르게 긋는 주관적 도구다 — 점수·상태·무효 가격을 같이 내고, 예측으로 쓰지 않게 화면이 밝힌다.

export const PATTERN_KINDS = ['tri_sym', 'tri_asc', 'tri_desc', 'wedge_up', 'wedge_down', 'channel_up', 'channel_down', 'range', 'double_top', 'double_bottom', 'triple_top', 'triple_bottom', 'hs', 'ihs'];
// 패턴이 보통 가리키는 방향 (교과서 기준) — 확정은 돌파로
export const PATTERN_BIAS = { tri_sym: 0, tri_asc: 1, tri_desc: -1, wedge_up: -1, wedge_down: 1, channel_up: 0, channel_down: 0, range: 0, double_top: -1, double_bottom: 1, triple_top: -1, triple_bottom: 1, hs: -1, ihs: 1 };

const SENS = [1.6, 2.3, 3.2];   // 고점·저점을 나누는 되돌림 크기 (ATR 배수) — 작을수록 잘게

function atrSeries(b, n = 14) {
  const out = new Array(b.length).fill(null); let a = null;
  for (let i = 1; i < b.length; i++) {
    const tr = Math.max(b[i].high - b[i].low, Math.abs(b[i].high - b[i - 1].close), Math.abs(b[i].low - b[i - 1].close));
    a = a == null ? tr : (a * (n - 1) + tr) / n;
    out[i] = a;
  }
  out[0] = out[1];
  return out;
}

// 고점·저점 — 직전 꼭짓점에서 k×ATR 이상 되돌리면 확정. 마지막 극값은 아직 확정 전(tentative)
export function zigzag(b, k, atr = atrSeries(b)) {
  const piv = [];
  let dir = 0, hi = { i: 0, p: b[0].high }, lo = { i: 0, p: b[0].low };
  for (let i = 1; i < b.length; i++) {
    const th = k * (atr[i] ?? 0);
    if (b[i].high >= hi.p) hi = { i, p: b[i].high };
    if (b[i].low <= lo.p) lo = { i, p: b[i].low };
    if (dir >= 0 && hi.p - b[i].low >= th && hi.i < i) {   // 위에서 내려옴 → 고점 확정
      if (dir === 1 || !piv.length) piv.push({ i: hi.i, p: hi.p, type: 'H' });
      dir = -1; lo = { i, p: b[i].low }; for (let j = hi.i + 1; j <= i; j++) if (b[j].low < lo.p) lo = { i: j, p: b[j].low };
    } else if (dir <= 0 && b[i].high - lo.p >= th && lo.i < i) {   // 아래에서 올라옴 → 저점 확정
      if (dir === -1 || !piv.length) piv.push({ i: lo.i, p: lo.p, type: 'L' });
      dir = 1; hi = { i, p: b[i].high }; for (let j = lo.i + 1; j <= i; j++) if (b[j].high > hi.p) hi = { i: j, p: b[j].high };
    }
  }
  if (dir === 1 && hi.i > (piv.at(-1)?.i ?? -1)) piv.push({ i: hi.i, p: hi.p, type: 'H', tentative: true });
  if (dir === -1 && lo.i > (piv.at(-1)?.i ?? -1)) piv.push({ i: lo.i, p: lo.p, type: 'L', tentative: true });
  return piv;
}

// 최소제곱 직선 (점 2개면 그 두 점을 잇는다)
function fit(pts) {
  const n = pts.length; if (n < 2) return null;
  const mx = pts.reduce((s, q) => s + q.i, 0) / n, my = pts.reduce((s, q) => s + q.p, 0) / n;
  let num = 0, den = 0; for (const q of pts) { num += (q.i - mx) * (q.p - my); den += (q.i - mx) ** 2; }
  const m = den ? num / den : 0, c = my - m * mx;
  return { m, c, at: (x) => m * x + c, err: Math.max(...pts.map((q) => Math.abs(q.p - (m * q.i + c)))) };
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

/**
 * @returns {Array<{kind, bias, status, score, agree, start, end, lines, points, levels, height, touches, bars}>}
 *   lines:  [{ role: 'upper'|'lower'|'neck', a:{t,p}, b:{t,p} }]   points: [{ t, p, label }]
 *   levels: { up, down, target_up, target_down, invalid }  (가격, 없으면 null)   status: forming | breakout_up | breakout_down
 */
export function findPatterns(bars, { step = 86400, recent = null, max = 6 } = {}) {
  const n = bars.length;
  if (n < 60) return [];
  const atr = atrSeries(bars);
  const T = (x) => (x <= n - 1 ? bars[Math.max(0, Math.round(x))].time : bars[n - 1].time + Math.round(x - (n - 1)) * step);
  const lastC = bars[n - 1].close, A = atr[n - 1];
  const RECENT = recent ?? Math.max(15, Math.round(n * 0.12));   // 이보다 오래전에 끝난 것은 '지금' 패턴이 아니다
  const found = [];

  for (const k of SENS) {
    const piv = zigzag(bars, k, atr);
    if (piv.length < 4) continue;
    const lastPiv = piv.length - 1;

    // ---- 선 두 개 (삼각수렴·쐐기·채널·박스) ----
    for (let m = 7; m >= 4; m--) {
      for (const endAt of [lastPiv, lastPiv - 1]) {
        const s0 = endAt - m + 1; if (s0 < 0) continue;
        const W = piv.slice(s0, endAt + 1);
        const Hs = W.filter((q) => q.type === 'H'), Ls = W.filter((q) => q.type === 'L');
        if (Hs.length < 2 || Ls.length < 2) continue;
        const i0 = W[0].i, i1 = W.at(-1).i;
        if (n - 1 - i1 > RECENT) continue;
        const aW = mean(atr.slice(i0, i1 + 1).filter(Boolean)), tol = 0.55 * aW;
        const U = fit(Hs), L = fit(Ls);
        if (!U || !L || U.err > tol * 1.2 || L.err > tol * 1.2) continue;
        const h0 = U.at(i0) - L.at(i0), h1 = U.at(i1) - L.at(i1);
        if (h0 < 2.2 * aW || h1 <= 0.2 * aW) continue;
        // 사이 봉이 대부분 두 선 안에
        let inside = 0; for (let j = i0; j <= i1; j++) if (bars[j].close <= U.at(j) + tol && bars[j].close >= L.at(j) - tol) inside++;
        const contain = inside / (i1 - i0 + 1);
        if (contain < 0.9) continue;
        const len = i1 - i0;
        if (len < 15) continue;
        const sU = (U.m * len) / aW, sL = (L.m * len) / aW, ratio = h1 / h0;   // 기울기는 창 전체 움직임을 ATR 로
        const FLAT = 1.2;
        let kind = null;
        if (ratio < 0.72) {   // 좁아짐
          if (Math.abs(sU) < FLAT && sL > FLAT) kind = 'tri_asc';
          else if (sU < -FLAT && Math.abs(sL) < FLAT) kind = 'tri_desc';
          else if (sU < -FLAT * 0.5 && sL > FLAT * 0.5) kind = 'tri_sym';
          else if (sU > 0 && sL > 0 && sL > sU) kind = 'wedge_up';
          else if (sU < 0 && sL < 0 && sU < sL) kind = 'wedge_down';
        } else if (ratio <= 1.3) {   // 거의 평행
          if (Math.abs(sU) < FLAT && Math.abs(sL) < FLAT) kind = 'range';
          else if (sU > FLAT && sL > FLAT) kind = 'channel_up';
          else if (sU < -FLAT && sL < -FLAT) kind = 'channel_down';
        }
        if (!kind) continue;
        // 수렴형은 꼭짓점(두 선 만나는 곳)이 이미 한참 지났으면 버린다
        let apex = null;
        if (kind.startsWith('tri') || kind.startsWith('wedge')) { apex = (L.c - U.c) / (U.m - L.m); if (!(apex > i1)) continue; }
        // 지금 상태 — 마지막 꼭짓점 뒤 처음으로 선 밖에서 마감한 봉
        let br = null;
        for (let j = i1 + 1; j < n; j++) { if (bars[j].close > U.at(j) + 0.25 * atr[j]) { br = { j, dir: 1 }; break; } if (bars[j].close < L.at(j) - 0.25 * atr[j]) { br = { j, dir: -1 }; break; } }
        if (br && n - 1 - br.j > Math.max(8, Math.round(len * 0.35))) continue;   // 돌파가 오래전 — 지난 이야기
        if (apex != null && (br ? br.j >= apex : apex < n - 1 + 2)) continue;   // 꼭짓점을 지났는데 돌파가 없었거나, 꼭짓점 뒤 돌파 — 패턴이 끝난 것
        const status = br ? (br.dir > 0 ? 'breakout_up' : 'breakout_down') : 'forming';
        // 선 끝: 돌파했으면 돌파 봉 조금 뒤까지, 아니면 오른쪽 미래로 조금(수렴형은 꼭짓점까지만). 시작은 선마다 자기 첫 접점
        const xEnd = br ? Math.min(n - 1, br.j + 3) : apex ? Math.min(apex, n - 1 + Math.max(5, Math.round(len * 0.25))) : n - 1 + Math.max(3, Math.round(len * 0.1));
        const uA = Hs[0].i, lA = Ls[0].i;
        const xL = br ? br.j : n - 1, upNow = U.at(xL), dnNow = L.at(xL);   // 돌파했으면 돌파한 봉 기준 (꼭짓점을 지나면 두 선이 뒤집힌다)
        const touches = Hs.filter((q) => Math.abs(q.p - U.at(q.i)) <= tol).length + Ls.filter((q) => Math.abs(q.p - L.at(q.i)) <= tol).length;
        const fitQ = 1 - Math.min(1, (U.err + L.err) / (2 * tol * 1.2));
        found.push({ kind, k, start: bars[i0].time, end: bars[i1].time, i0, i1,
          lines: [{ role: 'upper', a: { t: T(uA), p: U.at(uA) }, b: { t: T(xEnd), p: U.at(xEnd) } }, { role: 'lower', a: { t: T(lA), p: L.at(lA) }, b: { t: T(xEnd), p: L.at(xEnd) } }],
          points: W.map((q) => ({ t: bars[q.i].time, p: q.p, label: '' })),
          levels: { up: upNow, down: dnNow, target_up: upNow + h0, target_down: dnNow - h0, invalid: br ? (br.dir > 0 ? dnNow : upNow) : null },
          status, height: h0, touches, raw: 40 + Math.min(30, (touches - 4) * 8 + 10) + fitQ * 20 + (contain - 0.9) * 100, bars: len });
      }
    }

    // ---- 꼭짓점 높이 (이중·삼중 천장/바닥, 헤드앤숄더) ----
    const tail = piv.slice(-7);
    const at = (j) => tail[j];
    for (let s = 0; s < tail.length; s++) {
      const q = tail.slice(s);
      const tolP = (i) => 0.6 * atr[i];
      // 이중 천장/바닥: X1 Y X2 (+ 지금)
      if (q.length >= 3 && q.length <= 4) {
        const [x1, y, x2] = q, top = x1.type === 'H';
        const depth = top ? Math.min(x1.p, x2.p) - y.p : y.p - Math.max(x1.p, x2.p);
        if (x2.type === x1.type && Math.abs(x1.p - x2.p) <= Math.max(tolP(x2.i), 0.4 * depth) && depth >= 2.5 * atr[y.i] && x2.i - x1.i >= 6 && n - 1 - x2.i <= RECENT) {
          const neck = y.p, broke = top ? lastC < neck - 0.2 * A : lastC > neck + 0.2 * A, xE = n - 1 + 3;
          const kind = top ? 'double_top' : 'double_bottom', h = Math.abs((x1.p + x2.p) / 2 - neck);
          found.push({ kind, k, start: bars[x1.i].time, end: bars[x2.i].time, i0: x1.i, i1: x2.i,
            lines: [{ role: 'neck', a: { t: T(x1.i), p: neck }, b: { t: T(xE), p: neck } }, { role: 'upper', a: { t: T(x1.i), p: x1.p }, b: { t: T(x2.i), p: x2.p } }],
            points: [{ t: bars[x1.i].time, p: x1.p, label: '1' }, { t: bars[y.i].time, p: y.p, label: '' }, { t: bars[x2.i].time, p: x2.p, label: '2' }],
            levels: top ? { up: Math.max(x1.p, x2.p), down: neck, target_up: null, target_down: neck - h, invalid: Math.max(x1.p, x2.p) } : { up: neck, down: Math.min(x1.p, x2.p), target_up: neck + h, target_down: null, invalid: Math.min(x1.p, x2.p) },
            status: broke ? (top ? 'breakout_down' : 'breakout_up') : 'forming', height: h, touches: 3, raw: 55 + Math.min(20, depth / atr[y.i] * 3) - Math.abs(x1.p - x2.p) / tolP(x2.i) * 8, bars: x2.i - x1.i });
        }
      }
      // 삼중: X1 Y1 X2 Y2 X3
      if (q.length >= 5 && q.length <= 6) {
        const [x1, y1, x2, y2, x3] = q, top = x1.type === 'H';
        const xs = [x1.p, x2.p, x3.p], spread = Math.max(...xs) - Math.min(...xs), neck = top ? Math.min(y1.p, y2.p) : Math.max(y1.p, y2.p);
        const depth = top ? Math.min(...xs) - neck : neck - Math.max(...xs);
        if (spread <= Math.max(0.8 * atr[x3.i], 0.35 * depth) && depth >= 2.5 * atr[x3.i] && n - 1 - x3.i <= RECENT) {
          const broke = top ? lastC < neck - 0.2 * A : lastC > neck + 0.2 * A, xE = n - 1 + 3, h = Math.abs(mean(xs) - neck);
          found.push({ kind: top ? 'triple_top' : 'triple_bottom', k, start: bars[x1.i].time, end: bars[x3.i].time, i0: x1.i, i1: x3.i,
            lines: [{ role: 'neck', a: { t: T(x1.i), p: neck }, b: { t: T(xE), p: neck } }],
            points: [x1, x2, x3].map((z, j) => ({ t: bars[z.i].time, p: z.p, label: String(j + 1) })),
            levels: top ? { up: Math.max(...xs), down: neck, target_up: null, target_down: neck - h, invalid: Math.max(...xs) } : { up: neck, down: Math.min(...xs), target_up: neck + h, target_down: null, invalid: Math.min(...xs) },
            status: broke ? (top ? 'breakout_down' : 'breakout_up') : 'forming', height: h, touches: 5, raw: 65 - spread / atr[x3.i] * 6, bars: x3.i - x1.i });
        }
        // 헤드앤숄더: LS N1 H N2 RS
        const head = x2, ls = x1, rs = x3, hsTop = top;
        const above = hsTop ? head.p - Math.max(ls.p, rs.p) : Math.min(ls.p, rs.p) - head.p;
        const sh = Math.abs(ls.p - rs.p), tL = head.i - ls.i, tR = rs.i - head.i;
        if (above >= 0.8 * atr[head.i] && sh <= Math.max(1.2 * atr[rs.i], 0.5 * above) && tL / tR > 0.4 && tL / tR < 2.5 && n - 1 - rs.i <= RECENT) {
          const nk = fit([y1, y2]), headH = Math.abs(head.p - nk.at(head.i));
          if (headH >= 2.5 * atr[head.i] && Math.abs(nk.m * (y2.i - y1.i)) <= 0.6 * headH) {
            const nNow = nk.at(n - 1), broke = hsTop ? lastC < nNow - 0.2 * A : lastC > nNow + 0.2 * A, xE = n - 1 + 3;
            found.push({ kind: hsTop ? 'hs' : 'ihs', k, start: bars[ls.i].time, end: bars[rs.i].time, i0: ls.i, i1: rs.i,
              lines: [{ role: 'neck', a: { t: T(y1.i), p: nk.at(y1.i) }, b: { t: T(xE), p: nk.at(xE) } }],
              points: [{ t: bars[ls.i].time, p: ls.p, label: 'LS' }, { t: bars[head.i].time, p: head.p, label: 'H' }, { t: bars[rs.i].time, p: rs.p, label: 'RS' }],
              levels: hsTop ? { up: rs.p, down: nNow, target_up: null, target_down: nNow - headH, invalid: head.p } : { up: nNow, down: rs.p, target_up: nNow + headH, target_down: null, invalid: head.p },
              status: broke ? (hsTop ? 'breakout_down' : 'breakout_up') : 'forming', height: headH, touches: 5, raw: 70 + Math.min(15, above / atr[head.i] * 4) - sh / atr[rs.i] * 5, bars: rs.i - ls.i });
          }
        }
      }
    }
  }

  // ---- 같은 패턴 합치기 (민감도 단계끼리) — 겹치는 구간 60% 이상이면 하나, 단계가 많이 일치할수록 가점 ----
  const groups = [];
  for (const f of found.sort((a, b) => b.raw - a.raw)) {
    const g = groups.find((x) => x.kind === f.kind && Math.max(0, Math.min(x.i1, f.i1) - Math.max(x.i0, f.i0)) >= 0.6 * Math.min(x.i1 - x.i0, f.i1 - f.i0));
    if (g) { g.ks.add(f.k); continue; }
    groups.push({ ...f, ks: new Set([f.k]) });
  }
  // 방향이 반대인 두 패턴이 같은 구간을 덮으면(예: 상승 쐐기 vs 상승 채널) 점수 높은 것만
  const out = [];
  for (const g of groups) {
    const clash = out.find((x) => Math.max(0, Math.min(x.i1, g.i1) - Math.max(x.i0, g.i0)) >= 0.7 * Math.min(x.i1 - x.i0, g.i1 - g.i0) && (x.lines.length === 2) === (g.lines.length === 2));
    if (clash) continue;
    out.push(g);
  }
  return out.map((g) => {
    // 돌파했으면 그 방향 목표만
    if (g.status === 'breakout_up') g.levels.target_down = null; else if (g.status === 'breakout_down') g.levels.target_up = null;
    const score = Math.round(Math.max(0, Math.min(100, g.raw + (g.ks.size - 1) * 8)));
    const { raw, ks, k, ...rest } = g;
    return { ...rest, bias: PATTERN_BIAS[g.kind], score, agree: ks.size };
  }).sort((a, b) => (b.i1 - a.i1 > 10 || a.i1 - b.i1 > 10 ? b.i1 - a.i1 : b.score - a.score)).slice(0, max)
    .sort((a, b) => b.score - a.score);
}
