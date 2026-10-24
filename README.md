# Steadytrade

**Market research where every number has a source.** Ask a question about crypto, stocks, rates or macro in plain language — Steadytrade pulls the data, runs the test, and writes a report that shows what it checked and what it could not.

🌐 **https://www.steadytrade.net** · [Data status](https://www.steadytrade.net/status) · [Public reports](https://www.steadytrade.net/reports?tab=public) · [한국어](README.ko.md)

![Home](docs/img/home.png)

---

## What it does

| | |
|---|---|
| **Ask the AI analyst** | Describe a strategy or a question ("buy BTC after three days of ETF outflows — did that work?"). An AI analyst calls data tools, backtests, and writes a report. |
| **Strategy lab** | Build a trading rule by picking conditions, using a fixed method (scale-in, grid, periodic buying, staircase cycle), writing a short script, or just describing it. The backtest runs in your browser with the open engine in this repository. Save privately, share a result link, like other people's strategies. ([how it is calculated](docs/strategy-lab.md)) |
| **Reports** | Each report lists what you asked as a checklist and marks every item *Checked*, *Partly* or *Not checked*. Conclusions carry a confidence level, and reports are frozen when created. |
| **Markets** | Crypto (top coins with gainers/losers by exchange — Binance first, funding; the kimchi premium in the Korean view), whales (Hyperliquid top traders, Binance long/short, BTC ETF flows, corporate BTC holders), stocks & indices, rates, FX and commodities. |
| **Flows & positioning** | CFTC futures positioning by trader type, US ETF money in/out, FINRA short-sale share, CBOE put/call, SEC Form 4 insider trades, quarterly 13F changes of well-known investors. |
| **Charts** | Exchange and Yahoo candles, 20+ indicators, drawings, similar-pattern search, and rule-based chart pattern detection (triangles, wedges, double/triple tops & bottoms, head and shoulders). |
| **Status** | A public page showing when each data source last arrived and whether every collector is healthy. |

Available in English, Korean, Japanese and Simplified Chinese — the site follows your browser language, or open any page with `?lang=en`, `?lang=ja`, `?lang=zh` or `?lang=ko` (for example [steadytrade.net/?lang=en](https://www.steadytrade.net/?lang=en)).

## Screenshots

| Report with checklist | Chart patterns |
|---|---|
| ![Report](docs/img/report.png) | ![Chart patterns](docs/img/chart-patterns.png) |

| Strategy lab (staircase cycle) | Chart |
|---|---|
| ![Strategy lab](docs/img/strategy-cycle.png) | ![Chart](docs/img/chart.png) |

| Flows & positioning | Data source status |
|---|---|
| ![Flows](docs/img/flows.png) | ![Status](docs/img/status.png) |

## Principles

- **Sources first.** Data comes from exchanges and official publishers (CFTC, SEC, FINRA, CBOE, US Treasury, ETF issuers). See [docs/data-sources.md](docs/data-sources.md).
- **Closed bars only, no filled gaps.** Price bars are stored only after they close. Missing data stays missing and is shown as missing.
- **Say what was not checked.** If a report could not answer part of a question, it says so at the top instead of guessing. See [docs/reports.md](docs/reports.md).
- **Monitored in public.** Every collector is checked every 10 minutes; a late one is re-run once automatically. Results are on the [status page](https://www.steadytrade.net/status).
- **Research, not advice.** Nothing on the site is a recommendation to buy or sell.

## Open code in this repository

The full service is not open source, but the pure calculation code behind the charts and the strategy lab is — so anyone can check how the numbers are made.

| Path | What it is |
|---|---|
| [`src/patterns.js`](src/patterns.js) | Chart pattern detector used on the site. Rule-based and deterministic — no AI. ([how it works](docs/chart-patterns.md)) |
| [`src/indicators.js`](src/indicators.js) | Indicator engine used by the chart: SMA, EMA, Bollinger, RSI, MACD, Parabolic SAR, Stochastic, ADX, Donchian, Supertrend, Keltner, VWAP, ATR, CCI, Williams %R, OBV, MFI, ROC and more. |
| [`src/backtest/`](src/backtest) · [`src/schema/`](src/schema) | Backtest engine of the strategy lab: next-bar-open fills, fees and slippage, funding, longer-bar filters, the rule format and its validator, and the staircase cycle. ([how it works](docs/strategy-lab.md)) |
| [`src/metrics.js`](src/metrics.js) · [`src/bt-stats.js`](src/bt-stats.js) | Drawdown, win-rate confidence interval, trade statistics shown under each result. |
| [`examples/find-patterns.mjs`](examples/find-patterns.mjs) | Run the detector on live Binance candles. |
| [`test/`](test) | Tests against a real BTC/USDT 4h sample — patterns, and the backtest engine (no look-ahead, cap never exceeded, deterministic). |

```bash
# Node.js 18+
node --test                                   # run the tests
node examples/find-patterns.mjs XRPUSDT 4h     # patterns on live candles
```

```text
XRPUSDT 4h · 300 closed bars · last close 1.3039

Falling wedge — forming · score 100 · 3/3 sensitivity levels agree
  lines: upper 1.3762 · lower 1.2913 · invalid —
  textbook target: up 1.5671 · down 1.1004  (pattern height from the break — a reference, not a forecast)
```

Code comments are in Korean; function names and the docs are in English.

## Changelog

What changed and when: [CHANGELOG.md](CHANGELOG.md).

## License

Code in this repository is released under the [MIT License](LICENSE). Screenshots and the Steadytrade name are not covered by it.

---

Made by 초코차 · [fmkorea 가상화폐](https://www.fmkorea.com/coin)
