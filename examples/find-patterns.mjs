// Find chart patterns on live Binance candles.
//   node examples/find-patterns.mjs            → BTCUSDT 4h
//   node examples/find-patterns.mjs XRPUSDT 1d
// Uses Binance's public market-data endpoint (no key). Only closed bars are used.
import { findPatterns } from '../src/patterns.js';

const [symbol = 'BTCUSDT', tf = '4h'] = process.argv.slice(2);
const STEP = { '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 }[tf];
if (!STEP) throw new Error(`timeframe must be one of 15m 1h 4h 1d 1w`);

const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=301`);
if (!res.ok) throw new Error(`Binance ${res.status}`);
const rows = (await res.json()).slice(0, -1);   // drop the bar that is still open
const bars = rows.map((r) => ({ time: r[0] / 1000, open: +r[1], high: +r[2], low: +r[3], close: +r[4] }));

const NAME = {
  tri_sym: 'Symmetrical triangle', tri_asc: 'Ascending triangle', tri_desc: 'Descending triangle',
  wedge_up: 'Rising wedge', wedge_down: 'Falling wedge', channel_up: 'Rising channel', channel_down: 'Falling channel', range: 'Range',
  double_top: 'Double top', double_bottom: 'Double bottom', triple_top: 'Triple top', triple_bottom: 'Triple bottom',
  hs: 'Head and shoulders', ihs: 'Inverse head and shoulders',
};
const px = (v) => (v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: v < 10 ? 4 : 2 }));

const found = findPatterns(bars, { step: STEP });
console.log(`${symbol} ${tf} · ${bars.length} closed bars · last close ${px(bars.at(-1).close)}`);
if (!found.length) console.log('No clear pattern in recent bars.');
for (const p of found) {
  const L = p.levels;
  console.log(`\n${NAME[p.kind]} — ${p.status.replace('_', ' ')} · score ${p.score} · ${p.agree}/3 sensitivity levels agree`);
  console.log(`  lines: upper ${px(L.up)} · lower ${px(L.down)} · invalid ${px(L.invalid)}`);
  console.log(`  textbook target: up ${px(L.target_up)} · down ${px(L.target_down)}  (pattern height from the break — a reference, not a forecast)`);
}
