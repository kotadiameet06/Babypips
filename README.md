# BABYPIPS | XRPUSDT Inside Bar Momentum Trading Bot

A trading bot and backtesting platform converting the **Babypips Inside Bar Momentum Strategy** (Pine Script v3) to trade **XRP/USDT** on **Binance** on the **30-minute (30m)** timeframe.

---

## 📸 Interface Overview

1. **Live Dashboard (Image 1 Replica)**:
   - Modern neumorphic card design (`BABYPIPS` header, `TRADING MODE`, `● LIVE` pill, `1,962 TASKS`).
   - 4 Top Metric Cards:
     - **PROFIT-USD**: Real-time profit display (`+$642.90`, subtext `free trading: no cap`).
     - **BALANCE**: Live account balance (`$683.05`, subtext `started at $40.15`).
     - **SUBSCRIPTION / API**: Trading status (`$0.00`, `$20/mo due` or API status).
     - **WIN RATE**: Radial progress gauge with percentage (`83%`, `60W`, `11L`).
   - **Profit History Chart**: Interactive canvas chart showing green candlesticks and real-time equity curve.
   - **Activity Log**: Streaming live events with color-coded tags (`[RISK]`, `[SELL]`, `[SCAN]`, `[EXEC]`, `[FEE]`).
   - **Market Analysis**: Live dynamic statistics for `MOMENTUM`, `VOLUME`, and `RISK` calculated directly from Binance market data.

2. **Backtesting Studio (Image 2 Replica)**:
   - High-precision simulation using real Binance 30m historical klines.
   - Strategy parameters matching Pine Script:
     - `From Date` & `To Date`
     - `Stop Buy Order Percentage` (Default: 10%)
     - `Stop Loss Distance %` (Default: 20%)
     - `Take Profit Distance %` (Default: 80%)
     - `Risk % per trade` (Default: 2.0%)
     - `Initial Deposit` (Default: $10,000)
   - MetaTrader 4 / MetaTrader 5 Institutional Report with the **4 Iconic Yellow Highlight Boxes**:
     - **Box 1: Total net profit** (with Gross profit, Gross loss, Profit factor, Expected payoff)
     - **Box 2: Maximal drawdown** (Absolute drawdown, Maximal drawdown in $ and %, Relative drawdown)
     - **Box 3: Total trades** (Short positions won %, Long positions won %)
     - **Box 4: Profit trades (% of total)** (Loss trades %, Largest profit/loss trade, Average profit/loss trade, Maximum consecutive wins/losses)
   - Dual-line **Balance (Blue)** and **Equity (Green)** curve chart matching Image 2.
   - Detailed Trade Ledger with Export to CSV.

---

## ⚡ Strategy Logic (Pine Script v3)

- **Inside Bar Pattern**: Current candle (`bar 0`) is completely enclosed within previous candle (`bar 1` / mother candle):
  ```pinescript
  Inside_Bar = high[1] > high[0] and low[1] < low[0]
  Prev_Range = high[1] - low[1]
  Bullish = open[1] < close[1]
  Bearish = open[1] > close[1]
  ```
- **Long Setup**:
  - `Buy Stop Entry Level = high[1] + (Prev_Range * Stop_Buy_Perc)`
  - `Stop Loss Level = high[1] - (Prev_Range * Stop_Loss_Perc)`
  - `Take Profit Level = high[1] + (Prev_Range * Take_Prof_Perc)`
  - `Position Size = floor((equity * Risk) / (Long_Stop_Buy_Level - Long_Stop_Loss_Level))`
- **Short Setup**:
  - `Sell Stop Entry Level = low[1] - (Prev_Range * Stop_Buy_Perc)`
  - `Stop Loss Level = low[1] + (Prev_Range * Stop_Loss_Perc)`
  - `Take Profit Level = low[1] - (Prev_Range * Take_Prof_Perc)`
  - `Position Size = floor((equity * Risk) / (Short_Stop_Loss_Level - Short_Stop_Buy_Level))`
- **Cancellation / Reversal**:
  - If another Inside Bar forms, any active position is closed, pending orders canceled, and new levels set from the latest candles.

---

## 🚀 How to Run

1. **Start the application**:
   ```bash
   node server.js
   ```
   Or via npm:
   ```bash
   npm.cmd start
   ```

2. **Open in browser**:
   Navigate to:
   ```
   http://localhost:3000
   ```

3. **Trading Modes**:
   - **Paper Trading** (Default): Safely simulates trade fills and inside bar triggers using real-time Binance market prices with zero financial risk.
   - **Binance Testnet**: Connects to `testnet.binance.vision` using testnet API keys.
   - **Binance Live**: Places real spot orders on Binance using your API credentials with HMAC-SHA256 signing.
