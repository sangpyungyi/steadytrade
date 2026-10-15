# Data sources

Where Steadytrade gets its data, and how often. Live health of every collector: **https://www.steadytrade.net/status** (checked every 10 minutes; a late collector is re-run once automatically).

Rules that apply everywhere:

- **Closed bars only.** A price bar is stored after it closes. The bar that is still forming is never saved.
- **No filled gaps.** If a source has no data for a day, the day stays empty. Charts and reports show it as missing.
- **Release dates are kept.** Weekly and quarterly data (COT, 13F) is shown with the date it was *published*, not only the date it describes — so a backtest never uses data before it was public.

## Prices

| Data | Source | Cadence |
|---|---|---|
| Crypto candles | Binance (spot & USD-M futures), OKX, Hyperliquid, Upbit, Bithumb | collected continuously; health limit 15 min |
| Stocks, indices, futures, FX | Yahoo Finance | same |
| US Treasury yields | U.S. Department of the Treasury (daily par yield curve) | daily |
| Exchange prices, funding, kimchi premium | Binance, Bybit, OKX, Bitget, Gate.io, BingX, Coinbase, Kraken, Upbit, Bithumb | every minute |
| Coin market data, Fear & Greed | CoinGecko, Alternative.me | every 5 min |

## Crypto positioning ("whales")

| Data | Source | Cadence |
|---|---|---|
| Top-trader leaderboard and open positions | Hyperliquid public API | positions every 10 min, leaderboard every few hours |
| Long/short ratios | Binance futures | hourly |
| Spot bitcoin ETF daily flows (total and by fund) | bitbo.io | daily |
| Companies and governments holding BTC | bitcointreasuries.net | several times a day |

## Stocks & indices: flows and positioning

| Data | Source | Cadence |
|---|---|---|
| Futures positioning by trader type (COT, Traders in Financial Futures) | CFTC public reporting | weekly — positions as of Tuesday, released Friday |
| US ETF money in/out (shares outstanding × NAV) | ETF issuers (iShares, State Street SPDR, …) | every trading day |
| Short-sale share of volume | FINRA daily short sale volume files | every trading day |
| Put/call ratios | Cboe daily market statistics | every trading day |
| Insider trades (Form 4) | SEC EDGAR | every 30 min |
| Quarterly holdings of well-known investors (13F) | SEC EDGAR | as filed (quarterly, up to 45 days after quarter end) |

## News and calendar

| Data | Source | Cadence |
|---|---|---|
| Economic calendar (forecast / previous / actual) | Forex Factory weekly feed; past releases from Nasdaq's economic calendar | several times a day; health limit 3 h |
| Headlines | CNBC, Investing.com, CoinDesk, Federal Reserve press releases (RSS) | continuously; health limit 45 min |
| Translation of headlines and calendar | machine translation into en / ko / ja / zh | after each update; health limit 2 h |

## Fetched on demand by the AI analyst

| Data | Source |
|---|---|
| Bitcoin / Ether implied volatility (DVOL) | Deribit |
| Stablecoin supply | DefiLlama |
| US macro series | FRED (Federal Reserve Bank of St. Louis) |
| Prediction-market odds | Polymarket |
| News search | Google News RSS |

Each report lists the data it actually used, with dates.
