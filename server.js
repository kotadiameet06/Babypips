const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { BinanceClient } = require('./src/binanceClient');
const { Backtester } = require('./src/backtester');
const { TradingBotEngine } = require('./src/botEngine');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const binanceClient = new BinanceClient();
const bot = new TradingBotEngine({
  initialBalance: 23.00, // ₹2,000 INR equivalent (~$23.00 USD dummy portfolio)
  startingBalance: 23.00,
  mode: 'PAPER'
});

// Start trading bot loop
bot.start();

// WebSocket connection handling
wss.on('connection', (ws) => {
  bot.addClient(ws);

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'START_BOT') bot.start();
      if (data.type === 'PAUSE_BOT') bot.pause();
      if (data.type === 'STOP_BOT') bot.stop();
      if (data.type === 'RESET_PORTFOLIO') bot.resetPortfolio(data.balance || 23.00, data.balance || 23.00);
      if (data.type === 'UPDATE_CONFIG') bot.updateConfig(data.config);
    } catch (e) {
      console.warn('Invalid WS message:', e.message);
    }
  });

  ws.on('close', () => {
    bot.removeClient(ws);
  });
});

// REST Endpoints
app.get('/api/status', (req, res) => {
  res.json(bot.getState());
});

app.post('/api/bot/start', (req, res) => {
  bot.start();
  res.json({ success: true, status: bot.status, state: bot.getState() });
});

app.post('/api/bot/pause', (req, res) => {
  bot.pause();
  res.json({ success: true, status: bot.status, state: bot.getState() });
});

app.post('/api/bot/stop', (req, res) => {
  bot.stop();
  res.json({ success: true, status: bot.status, state: bot.getState() });
});

app.post('/api/bot/reset', (req, res) => {
  const initBal = req.body && req.body.initialBalance ? Number(req.body.initialBalance) : 23.00;
  bot.resetPortfolio(initBal, initBal);
  res.json({ success: true, status: bot.status, state: bot.getState() });
});

app.post('/api/bot/config', (req, res) => {
  bot.updateConfig(req.body);
  res.json({ success: true, state: bot.getState() });
});

app.get('/api/klines', async (req, res) => {
  try {
    const symbol = req.query.symbol || 'XRPUSDT';
    const interval = req.query.interval || '30m';
    const limit = parseInt(req.query.limit) || 40;
    const klines = await binanceClient.getKlines(symbol, interval, limit);
    res.json(klines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// High-precision Backtesting Endpoint matching Pine Script parameters
app.post('/api/backtest', async (req, res) => {
  try {
    const {
      fromYear = 2026,
      fromMonth = 1,
      fromDay = 1,
      toYear = 9999,
      toMonth = 12,
      toDay = 31,
      stopBuyPerc = 10,
      stopLossPerc = 20,
      takeProfPerc = 80,
      risk = 2,
      initialDeposit = 100000,
      symbol = 'XRPUSDT',
      interval = '30m',
      maxBars = 20000,
      useBreakeven = true,
      breakevenTrigger = 0.50,
      consecutiveLossCooloff = false
    } = req.body;

    const startDate = new Date(Date.UTC(Number(fromYear), Number(fromMonth) - 1, Number(fromDay), 0, 0, 0));
    const endDate = toYear >= 9000
      ? new Date()
      : new Date(Date.UTC(Number(toYear), Number(toMonth) - 1, Number(toDay), 23, 59, 59));

    // Fetch candles from Binance
    const candles = await binanceClient.getHistoricalKlines(
      symbol,
      interval,
      startDate.getTime(),
      endDate.getTime(),
      maxBars
    );

    if (!candles || candles.length < 2) {
      return res.status(400).json({ error: 'Not enough historical candle data received for backtest' });
    }

    const backtester = new Backtester({
      initialDeposit: Number(initialDeposit),
      stopBuyPerc: Number(stopBuyPerc),
      stopLossPerc: Number(stopLossPerc),
      takeProfPerc: Number(takeProfPerc),
      risk: Number(risk),
      useBreakeven: useBreakeven === true || useBreakeven === 'true',
      breakevenTrigger: Number(breakevenTrigger) || 0.50,
      consecutiveLossCooloff: consecutiveLossCooloff === true || consecutiveLossCooloff === 'true'
    });

    const result = backtester.run(candles, {
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString()
    });

    // Enhance header info
    result.stats.symbol = `${symbol} (Binance)`;
    result.stats.period = `30 Minute (${interval}) ${fromYear}.${String(fromMonth).padStart(2,'0')}.${String(fromDay).padStart(2,'0')} - ${toYear >= 9000 ? new Date().toISOString().substring(0,10) : `${toYear}.${String(toMonth).padStart(2,'0')}.${String(toDay).padStart(2,'0')}`}`;

    res.json(result);
  } catch (err) {
    console.error('Backtest error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Save Binance API Keys
app.post('/api/api-keys', (req, res) => {
  const { apiKey, apiSecret, isTestnet } = req.body;
  binanceClient.setCredentials(apiKey, apiSecret, isTestnet);
  bot.binanceClient.setCredentials(apiKey, apiSecret, isTestnet);
  bot.mode = isTestnet ? 'TESTNET' : (apiKey ? 'LIVE' : 'PAPER');
  bot.addLog('RISK', `API credentials updated. Mode switched to ${bot.mode}`);
  res.json({ success: true, mode: bot.mode });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(` BABYPIPS | XRPUSDT Inside Bar Bot Running!      `);
  console.log(` URL: http://localhost:${PORT}                  `);
  console.log(` Timeframe: 30m | Symbol: XRPUSDT (Binance)      `);
  console.log(`=================================================`);
});
