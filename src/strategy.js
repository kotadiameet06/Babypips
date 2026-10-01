/**
 * Babypips: Inside Bar Momentum Strategy
 * Exact conversion of Pine Script v3 implementation
 * 
 * Strategy Rules:
 * 1. Inside Bar: Candle 0 is completely contained within Candle 1 (mother candle):
 *    high[1] > high[0] and low[1] < low[0]
 * 2. Range of Mother Candle:
 *    Prev_Range = high[1] - low[1]
 * 3. Direction of Mother Candle:
 *    Bullish = open[1] < close[1]
 *    Bearish = open[1] > close[1]
 * 4. Bullish Setup:
 *    - Pending Buy Stop Order at: high[1] + (Prev_Range * Stop_Buy_Perc)
 *    - Stop Loss at: high[1] - (Prev_Range * Stop_Loss_Perc)
 *    - Take Profit at: high[1] + (Prev_Range * Take_Prof_Perc)
 * 5. Bearish Setup:
 *    - Pending Sell Stop Order at: low[1] - (Prev_Range * Stop_Buy_Perc)
 *    - Stop Loss at: low[1] + (Prev_Range * Stop_Loss_Perc)
 *    - Take Profit at: low[1] - (Prev_Range * Take_Prof_Perc)
 * 6. Position Sizing:
 *    - long_qty  = floor((equity * Risk) / (Long_Stop_Buy_Level - Long_Stop_Loss_Level))
 *    - short_qty = floor((equity * Risk) / (Short_Stop_Loss_Level - Short_Stop_Buy_Level))
 * 7. Pattern Invalidation / Replacement:
 *    - If another inside bar pattern forms, any existing position is closed,
 *      pending orders canceled, and new orders placed according to the latest setup.
 */

class InsideBarStrategy {
  constructor(config = {}) {
    this.stopBuyPerc = (config.stopBuyPerc !== undefined ? config.stopBuyPerc : 10) / 100;
    this.stopLossPerc = (config.stopLossPerc !== undefined ? config.stopLossPerc : 20) / 100;
    this.takeProfPerc = (config.takeProfPerc !== undefined ? config.takeProfPerc : 80) / 100;
    this.riskPerc = (config.risk !== undefined ? config.risk : 2) / 100;
  }

  /**
   * Evaluates if candle0 is an inside bar inside candle1 (mother candle)
   * candle1 = previous candle (index 1 in pine script: high[1], low[1], open[1], close[1])
   * candle0 = current candle  (index 0 in pine script: high[0], low[0], open[0], close[0])
   */
  evaluatePattern(motherCandle, insideCandle) {
    if (!motherCandle || !insideCandle) return null;

    const mHigh = Number(motherCandle.high);
    const mLow = Number(motherCandle.low);
    const mOpen = Number(motherCandle.open);
    const mClose = Number(motherCandle.close);

    const iHigh = Number(insideCandle.high);
    const iLow = Number(insideCandle.low);

    // Inside Bar condition: mother bar high > inside bar high AND mother bar low < inside bar low
    const isInsideBar = mHigh > iHigh && mLow < iLow;
    if (!isInsideBar) return null;

    const prevRange = mHigh - mLow;
    if (prevRange <= 0) return null;

    const isBullish = mOpen < mClose;
    const isBearish = mOpen > mClose;

    if (!isBullish && !isBearish) return null; // Doji mother candle

    if (isBullish) {
      const stopBuyLevel = mHigh + (prevRange * this.stopBuyPerc);
      const stopLossLevel = mHigh - (prevRange * this.stopLossPerc);
      const takeProfitLevel = mHigh + (prevRange * this.takeProfPerc);

      return {
        pattern: 'Inside Bar (Bullish)',
        direction: 'LONG',
        motherCandle: { high: mHigh, low: mLow, open: mOpen, close: mClose, range: prevRange },
        insideCandle: { high: iHigh, low: iLow },
        entryPrice: stopBuyLevel,
        stopLoss: stopLossLevel,
        takeProfit: takeProfitLevel,
        riskDistance: Math.abs(stopBuyLevel - stopLossLevel),
        rewardDistance: Math.abs(takeProfitLevel - stopBuyLevel),
        riskRewardRatio: Math.abs(takeProfitLevel - stopBuyLevel) / Math.abs(stopBuyLevel - stopLossLevel)
      };
    } else {
      const stopSellLevel = mLow - (prevRange * this.stopBuyPerc);
      const stopLossLevel = mLow + (prevRange * this.stopLossPerc);
      const takeProfitLevel = mLow - (prevRange * this.takeProfPerc);

      return {
        pattern: 'Inside Bar (Bearish)',
        direction: 'SHORT',
        motherCandle: { high: mHigh, low: mLow, open: mOpen, close: mClose, range: prevRange },
        insideCandle: { high: iHigh, low: iLow },
        entryPrice: stopSellLevel,
        stopLoss: stopLossLevel,
        takeProfit: takeProfitLevel,
        riskDistance: Math.abs(stopLossLevel - stopSellLevel),
        rewardDistance: Math.abs(stopSellLevel - takeProfitLevel),
        riskRewardRatio: Math.abs(stopSellLevel - takeProfitLevel) / Math.abs(stopLossLevel - stopSellLevel)
      };
    }
  }

  /**
   * Calculate position size based strictly on Pine Script formula:
   * floor((strategy.equity * Risk) / Distance)
   */
  calculatePositionSize(equity, riskAmountOrDist, setup) {
    const riskDollar = equity * this.riskPerc;
    const distance = setup.riskDistance;
    if (distance <= 0) return 0;

    // Exact Pine Script formula: floor((strategy.equity * Risk) / (Long_Stop_Buy_Level - Long_Stop_Loss_Level))
    const qty = Math.floor(riskDollar / distance);
    return Math.max(1, qty);
  }

  /**
   * Drawdown Minimization: Checks if position reached Breakeven threshold
   * When price covers 50% of the distance to TP, SL moves to Entry price ($0 risk)
   */
  shouldMoveToBreakeven(position, currentHigh, currentLow, triggerRatio = 0.5) {
    if (!position || position.beTriggered) return false;
    if (position.direction === 'LONG') {
      const targetDist = position.takeProfit - position.entryPrice;
      const triggerPrice = position.entryPrice + (targetDist * triggerRatio);
      return currentHigh >= triggerPrice;
    } else if (position.direction === 'SHORT') {
      const targetDist = position.entryPrice - position.takeProfit;
      const triggerPrice = position.entryPrice - (targetDist * triggerRatio);
      return currentLow <= triggerPrice;
    }
    return false;
  }
}

module.exports = { InsideBarStrategy };
