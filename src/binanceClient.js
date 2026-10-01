const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BINANCE_BASE_URLS = [
  'https://data-api.binance.vision',
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com'
];

const TESTNET_BASE_URL = 'https://testnet.binance.vision';

class BinanceClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.BINANCE_API_KEY || '';
    this.apiSecret = options.apiSecret || process.env.BINANCE_API_SECRET || '';
    this.isTestnet = options.isTestnet !== undefined ? options.isTestnet : false;
    this.cacheDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  setCredentials(apiKey, apiSecret, isTestnet = false) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isTestnet = isTestnet;
  }

  async _request(endpoint, params = {}, options = {}) {
    const isPublic = options.isPublic ?? true;
    const isPost = options.method === 'POST';

    const baseUrl = this.isTestnet
      ? TESTNET_BASE_URL
      : BINANCE_BASE_URLS[0];

    const url = new URL(endpoint, baseUrl);

    let headers = {
      'Accept': 'application/json',
      'User-Agent': 'AstraFOMO-Babypips-Bot/1.0'
    };

    if (this.apiKey) {
      headers['X-MBX-APIKEY'] = this.apiKey;
    }

    if (!isPublic && this.apiSecret) {
      params.timestamp = Date.now();
      const queryString = new URLSearchParams(params).toString();
      const signature = crypto
        .createHmac('sha256', this.apiSecret)
        .update(queryString)
        .digest('hex');
      params.signature = signature;
    }

    if (!isPost) {
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null) {
          url.searchParams.append(key, params[key]);
        }
      });
    }

    let lastError = null;
    const urlsToTry = this.isTestnet ? [TESTNET_BASE_URL] : BINANCE_BASE_URLS;

    for (const host of urlsToTry) {
      try {
        const fetchUrl = new URL(url.pathname + url.search, host);
        const fetchOptions = {
          method: isPost ? 'POST' : 'GET',
          headers,
          signal: AbortSignal.timeout(8000)
        };
        if (isPost) {
          fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
          fetchOptions.body = new URLSearchParams(params).toString();
        }

        const res = await fetch(fetchUrl.toString(), fetchOptions);
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText}`);
        }
        return await res.json();
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('All Binance gateway requests failed');
  }

  /**
   * Fetch 24hr ticker information for a symbol (e.g. XRPUSDT)
   */
  async get24hTicker(symbol = 'XRPUSDT') {
    return this._request('/api/v3/ticker/24hr', { symbol });
  }

  /**
   * Fetch latest price
   */
  async getPrice(symbol = 'XRPUSDT') {
    const data = await this._request('/api/v3/ticker/price', { symbol });
    return Number(data.price);
  }

  /**
   * Fetch candles (klines) from Binance.
   * Returns array of:
   * [openTime, open, high, low, close, volume, closeTime, quoteAssetVolume, numberOfTrades, takerBuyBaseAssetVolume, takerBuyQuoteAssetVolume, ignore]
   */
  async getKlines(symbol = 'XRPUSDT', interval = '30m', limit = 500, startTime = null, endTime = null) {
    const params = { symbol, interval, limit };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    const raw = await this._request('/api/v3/klines', params);
    return raw.map(k => ({
      time: k[0],
      openTime: new Date(k[0]).toISOString(),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
      closeTime: k[6],
      quoteVolume: Number(k[7]),
      tradesCount: Number(k[8])
    }));
  }

  /**
   * Fetch multiple pages of historical klines between start and end time
   */
  async getHistoricalKlines(symbol = 'XRPUSDT', interval = '30m', startTime = null, endTime = null, maxBars = 10000) {
    const cacheKey = `${symbol}_${interval}_${startTime || 0}_${endTime || 'now'}.json`;
    const cacheFile = path.join(this.cacheDir, cacheKey);

    if (fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (Array.isArray(cached) && cached.length > 0) {
          // If cached data is recent enough or encompasses date range
          return cached;
        }
      } catch (e) {
        // ignore cache read error
      }
    }

    let allKlines = [];
    let currentStartTime = startTime || (Date.now() - 30 * 24 * 60 * 60 * 1000);
    const targetEndTime = endTime || Date.now();
    const batchSize = 1000;

    while (allKlines.length < maxBars) {
      try {
        const klines = await this.getKlines(symbol, interval, batchSize, currentStartTime, targetEndTime);
        if (!klines || klines.length === 0) break;

        for (const k of klines) {
          if (!allKlines.some(existing => existing.time === k.time)) {
            allKlines.push(k);
          }
        }

        allKlines.sort((a, b) => a.time - b.time);

        const latestTime = allKlines[allKlines.length - 1].time;
        if (latestTime >= targetEndTime) break;
        if (klines.length < batchSize) break;

        currentStartTime = latestTime + 1;
        // sleep a tiny bit to be gentle on Binance rate limits
        await new Promise(r => setTimeout(r, 60));
      } catch (err) {
        console.warn('Error fetching kline batch:', err.message);
        break;
      }
    }

    if (allKlines.length > 0) {
      try {
        fs.writeFileSync(cacheFile, JSON.stringify(allKlines));
      } catch (e) {}
    }

    return allKlines;
  }

  /**
   * Place an order (Spot / Testnet)
   */
  async createOrder({ symbol = 'XRPUSDT', side, type = 'MARKET', quantity, price, stopPrice }) {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('API key and secret required for live Binance orders');
    }

    const params = {
      symbol,
      side: side.toUpperCase(),
      type: type.toUpperCase(),
      quantity: quantity.toFixed(1)
    };

    if (type === 'LIMIT') {
      params.price = price.toFixed(4);
      params.timeInForce = 'GTC';
    } else if (type === 'STOP_LOSS_LIMIT' || type === 'TAKE_PROFIT_LIMIT') {
      params.price = price.toFixed(4);
      params.stopPrice = stopPrice.toFixed(4);
      params.timeInForce = 'GTC';
    }

    return this._request('/api/v3/order', params, { method: 'POST', isPublic: false });
  }
}

module.exports = { BinanceClient };
