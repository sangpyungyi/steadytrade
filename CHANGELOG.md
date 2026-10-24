# Changelog

Notable changes to [steadytrade.net](https://www.steadytrade.net). Dates are UTC+9.

## 2026-10-24
- **Strategy likes.** Heart any shared strategy; the strategy list now has *Public · Liked · Mine* tabs and a *Most liked* sort, like reports.
- **One screen for rule and result.** Opening a strategy card — public, liked or your own — opens the lab with the rule filled in and runs it right away, so the conditions and the result sit side by side.
- **Full-width strategy lab.** Settings stay pinned on the left while results use the rest of the screen; the AI chat box stops above the footer.
- **Language links.** Any page opens in a chosen language with `?lang=en|ja|zh|ko`; first-time visitors get their browser language.
- **Markets.** Gainers / losers / volume start from Binance; the kimchi premium is shown only in the Korean view; coin icons in the ranking.
- Backtest engine published in this repository (`src/backtest`, `src/schema`) with tests, and [docs/strategy-lab.md](docs/strategy-lab.md).

## 2026-10-23
- **Staircase cycle backtest (계단식 순환매매).** Seed on a MACD turn, add on each drop from the last buy, sell the whole cycle at a profit target; optional longer-bar filter and short mirror. The result leads with risk: largest amount invested, deepest unrealized loss, longest cycle, cycle still open.
- **Chart page redesign.** Full-screen layout with drawing tools on the left, a watchlist and summary on the right, chart types, and older bars loaded as you scroll back.
- Backtests fetch candles from the exchange when you press Run (one-minute cache) and widen a period that is too short for the bar size.
- Coin ranking: sortable columns, source line, exchange logos; whales long/short as cards or a list.

## 2026-10-21 – 22
- **Build a strategy by talking.** A short conversation settles what to build, then the rule is created and tested at once; follow-ups like "add a stop loss" edit the same rule.
- Alerts when a saved strategy's condition fires (members), managed under Settings › Notifications.

## 2026-10-20
- **Script strategies.** A small `onBar(ctx)` script for rules the condition lists cannot express, run in an isolated worker with a look-ahead check.

## 2026-10-19
- **Strategy lab sharing.** Share a backtest as a link (`/backtests/BT-####`), browse public strategies, start from samples, re-run any shared result up to today.

## 2026-10-18
- Describe a trading idea in everyday words and get an editable rule in the strategy lab.

## 2026-10-15
- **Chart patterns.** Rule-based detection of triangles, wedges, channels, ranges, double/triple tops & bottoms and head-and-shoulders, shown in a card inside the chart. Each pattern has a score, status, invalidation level and a textbook target with a plain note that it is not a forecast. Detector code published in this repository.
- **Stocks tab section bar.** Jump straight to overview, price table, futures positioning, ETF flows, short-sale share, put/call, famous investors or insider trades.
- Removed early prototype reports and duplicated test runs from the public list.

## 2026-10-14
- **Flows & positioning (stocks & indices).** CFTC futures positioning by trader type with weekly change bars, US ETF money in/out, FINRA short-sale share, Cboe put/call, SEC Form 4 insider trades.
- **Whales (crypto).** Hyperliquid top-trader positions, Binance long/short ratios, spot bitcoin ETF daily flows by fund, companies and governments holding BTC.
- New data tools for the AI analyst covering all of the above.
- Coin logos in the crypto market table.
- Collector health checks on the public status page.

## 2026-10-13
- Search any stock on Yahoo Finance and chart it live (1 minute to 1 week bars).

## 2026-10-12
- Markets split into tabs: Crypto · Stocks & indices · Rates, FX & commodities.
- Quarterly 13F: what well-known investors bought, sold and held in common.

## 2026-10-10
- **Report redesign.** Every report now starts with the question as a checklist (Checked / Partly / Not checked), a conclusion with a confidence level, and the evidence below.

## 2026-10-09
- Economic calendar and news drawer on every page; kimchi premium in the ticker.

## 2026-10-08
- Moved to a new server; user accounts.
