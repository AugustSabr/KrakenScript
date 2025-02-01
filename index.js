require('dotenv').config({ path: './keys.env' });
const { v4: uuidv4 } = require('uuid');

const telegramBot = require('./telegramBot');
const fileManager = require('./fileManager');
const KRKN_REST = require('./APIs/KRKN_REST');
const { WebSocketManager } = require('./APIs/KRKN_WS');

const wsManager = new WebSocketManager();
let symbols;

async function getAvailableUSD() {
  const { balance } = await KRKN_REST.getAccountBalance();
  const availableUSD = parseFloat(balance.ZUSD);
  let reserved = 0;
  for (const key in symbols) {
    if (symbols[key].holding < 0.000001) reserved++;
  }
  return reserved === 0 ? 0 : availableUSD / reserved;
}

  async function trade(symbol, ask, action) {
    if (symbols[symbol]['trade pending']) {
      console.log(`Trade for ${symbol} is locked. Skipping...`);
      return;
    }
    symbols[symbol]['trade pending'] = true;
    const currencyCode = symbols[key]["currency code"].AddOrder;
    const cl_ord_id = uuidv4();
  
    try {
      if (action === 'buy') {
        const availableUSD = await getAvailableUSD();
        const result = await KRKN_REST.makeRequestWithRetry(KRKN_REST.AddOrder(currencyCode, action, ask*(1+0.0005), availableUSD / ask, cl_ord_id));
        // console.log('buy?', result);
        await updateBalance();
        if (symbols[symbol].holding) {
          telegramBot.messageSubscribers(`bought ${symbol} for ${ask}$`);
          fileManager.writeToLogFile(`bought ${symbol} for ${ask}$`);
        }
      } else if (action === 'sell') {
        const result = await KRKN_REST.makeRequestWithRetry(KRKN_REST.AddOrder(currencyCode, action, ask*(1-0.0005), symbols[symbol].holding, cl_ord_id));
        console.log(result);
        await updateBalance();
        if (!symbols[symbol].holding) {
          telegramBot.messageSubscribers(`sold ${symbol} for ${ask}$`);
          fileManager.writeToLogFile(`sold ${symbol} for ${ask}$`);
        }
      } else {
        fileManager.writeToLogFile(`Unrecognized action in trade() function: ${action}`);
        telegramBot.messageMe('something wrong in the trade() function');
      }
    } catch (error) {
      console.error('Trade execution error:', error);
      telegramBot.messageMe(`Trade execution error for ${symbol}: ${error.message}`);
      fileManager.writeToLogFile(`Trade execution error for ${symbol}: ${error.message}`);
    } finally {
      setTimeout(() => {
        symbols[symbol]['trade pending'] = false;
      }, 10000);
    }
  }

  function calculateEMAWindows(arr) {
    arr = arr.slice(0, 20); // Use 20 data points (300 minutes data)
  
    if (arr.length < 20) reject(new Error("OHLC data insufficient for EMA"));

    const fastEMA = calculateEMA(arr, 10); // Fast EMA: 10 periods (latest 150 minutes)
    const slowEMA = calculateEMA(arr, 20); // Slow EMA: 20 periods (latest 300 minutes)

    return { 
      fastEMA: fastEMA, 
      slowEMA: slowEMA, 
    };
  }

function calculateEMA(arr, period) {
  let sma = arr.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
  const k = 2 / (period + 1);
  let ema = sma;

  for (let i = period; i < arr.length; i++) {
    ema = (arr[i] * k) + (ema * (1 - k));
  }
  return Math.round(ema * 10000) / 10000;
}

function updateAllEMAs() {
  const keys = Object.keys(symbols);
  const promises = keys.map(async key => {
    const ohlcPair = symbols[key]["currency code"].OHLC;

    const openPrices = await KRKN_REST.getOHLCData(ohlcPair, 15);
    const emaResult = calculateEMAWindows(openPrices);
    symbols[key]['EMA'].prevFastEMA = symbols[key]['EMA'].fastEMA;
    symbols[key]['EMA'].prevSlowEMA = symbols[key]['EMA'].slowEMA;
    symbols[key]['EMA'].fastEMA = emaResult.fastEMA;
    symbols[key]['EMA'].slowEMA = emaResult.slowEMA;
  });
  
   // Wait for all promises to resolve before logging symbols
  Promise.all(promises)
    .then(() => {
      // console.log(symbols);
    })
    .catch(err => {
      console.error('Error in Promise.all:', err);
    });
}

let lastCallTime = 0;
function evaluateTradeWithEMA(data) {
  try {
    const { fastEMA, slowEMA, prevFastEMA, prevSlowEMA } = symbols[data.symbol]['EMA'];
    if (fastEMA !== undefined) {

      const isRecentAbove = fastEMA > slowEMA;
      const wasPreviouslyBelow = prevFastEMA < prevSlowEMA;

      if (!symbols[data.symbol].holding){
        if (isRecentAbove && wasPreviouslyBelow){
          const currentTime = Date.now();
          if (currentTime - lastCallTime < 100) return;
          lastCallTime = currentTime;
          trade(data.symbol, data.ask, 'buy')
        }
      }else{
        if (!isRecentAbove && !wasPreviouslyBelow){
          const currentTime = Date.now();
          if (currentTime - lastCallTime < 100) return;
          lastCallTime = currentTime;

          trade(data.symbol, data.bid, 'sell')
        }
      }
    }
  } catch (error) {
    console.error(`EMA Evaluation Error for ${data.symbol}:`, error);
    telegramBot.messageMe(`EMA Evaluation Error: ${error.message}`);
  }
}


wsManager.on('update', (data) => {
  // console.log(' update:', data);
  symbols[data.symbol]['24h change'] = data.change_pct;
  // fileManager.writeToLogFile(`${data.symbol} ask: ${data.ask} ema: ${symbols[data.symbol].EMA}`);
  evaluateTradeWithEMA(data);
  // if (data.symbol = 'TRX') {
  //   console.log(data);
  // }
  // evaluateTradeWithEMA(data.symbol, 5);

  // console.log(`Updated ${data.symbol}:`, symbols[data.symbol], data.ask);
});

async function updateBalance() {
  const { balance } = await KRKN_REST.getAccountBalance();
    // console.log(`balance: ${JSON.stringify(balance)}`);

    Object.keys(symbols).forEach(key => {
      const symbol = symbols[key];
      const currencyCode = symbol["currency code"]["accountBalance"];
      if (balance[currencyCode]) {
        const amount = parseFloat(balance[currencyCode]);
          symbol.holding = amount;
      }
    });
    // console.log(symbols);
}

async function start() {
  try {
    const { symbolsObj, subscribersObj } = await fileManager.loadObjects();
    symbols = symbolsObj;
    telegramBot.subscribersObj = subscribersObj;

    await fileManager.emptyLogFile();

    await updateBalance()

    updateAllEMAs();
    setInterval(updateAllEMAs, 15*60*1000) // Call every 15 minutes (9000 000 milliseconds )
    setInterval(saveObjects, 60*60*1000) // Call every hour (3 600 000 milliseconds )

    wsManager.connectWebSocket(symbols);
    telegramBot.messageSubscribers('Script initialized and running...')
    fileManager.writeToLogFile('Script initialized and running...');
  } catch (error) {
    console.log(error); 
  }
}
start();

function saveObjects() {
  fileManager.saveObjects(symbols, telegramBot.subscribersObj);
}

process.on('SIGINT', () => {
  console.log('Caught interrupt signal (Ctrl+C). Performing cleanup...');

  fileManager.saveObjects(symbols, telegramBot.subscribersObj)
  wsManager.disconnect();
  fileManager.writeToLogFile('Program terminated by user (Ctrl+C).');
  telegramBot.messageSubscribers('Script shutting down...');

  process.exit(0);
});

// global error handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  telegramBot.messageMe(`CRITICAL UNCAUGHT ERROR: ${error.message}`);
  fileManager.saveObjects(symbols, telegramBot.subscribersObj)
  
  // Clean exit to let PM2 restart
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'Reason:', reason);
  telegramBot.messageMe(`UNHANDLED PROMISE REJECTION: ${reason.message || reason}`);
});