require('dotenv').config({ path: './keys.env' });
const { v4: uuidv4 } = require('uuid');

const telegramBot = require('./telegramBot');
const fileManager = require('./fileManager');
const KRKN_REST = require('./APIs/KRKN_REST');
const { WebSocketManager } = require('./APIs/KRKN_WS');

const wsManager = new WebSocketManager();
let symbols;

function getAvailableUSD() {
    return KRKN_REST.getAccountBalance()
    .then(function({ balance }) {
      const availableUSD = parseFloat(balance.ZUSD);
      let reserved = 0;
      for (let key in symbols) {
        if (symbols[key].holding < 0.000001) {
          reserved++;
        }
      }
      return availableUSD / reserved
    })
    .catch(function(error) {
      console.error("Error in getting balance:", error);
      return 0; // Handle error case
  });
}


function trade(symbol, ask, action) {  
  if (symbols[symbol]['trade pending']) {
    console.log(`Trade for ${symbol} is locked. Skipping...`);
    return;
  }
  symbols[symbol]['trade pending'] = true;
  const cl_ord_id = uuidv4(); // if i later want to add the possibility to track the order

  if (action == 'buy') {
    getAvailableUSD()
    .then(function(availableUSD) {
      console.log(symbols[symbol]['currency code'], action, ask, availableUSD/ask, cl_ord_id);
      KRKN_REST.makeRequestWithRetry(KRKN_REST.AddOrder(symbol, action, ask, availableUSD/ask, cl_ord_id))
      // KRKN_REST.makeRequestWithRetry(KRKN_REST.AddOrder(symbol, action, ask, 2, cl_ord_id))
      .then(function(result) {
        console.log(result);
        telegramBot.messageSubscribers(`bought ${symbol} for ${ask}$`)
        fileManager.writeToLogFile(`bought ${symbol} for ${ask}$`)
        updateBalance()
      });
    });
  } else if (action == 'sell'){
    KRKN_REST.makeRequestWithRetry(KRKN_REST.AddOrder(symbol, action, ask, symbols[symbol].holding, cl_ord_id))
      .then(function(result) {
        console.log(result);
        telegramBot.messageSubscribers(`sold ${symbol} for ${ask}$`)
        fileManager.writeToLogFile(`sold ${symbol} for ${ask}$`)
        updateBalance()

      });
} else {
    fileManager.writeToLogFile(`Unrecognized action in trade() function: ${action}`);
    telegramBot.messageMe('something wrong in the trade() function')
  }
  setTimeout(() => {
    symbols[symbol]['trade pending'] = false;
  }, 10000);
  }

function calculateEMA(arr) {
  arr = arr.slice(-144).reverse(); //144 5-minute datapoints is 14hrs

  const k = 2 / (arr.length + 1); // Think kraken uses approximately  0.125 for ema calculations?
  let ema = arr[0];
  for (let i = 1; i < arr.length; i++) {
    ema = (arr[i] * k) + (ema * (1 - k));
  }
  ema = Math.round(ema * 10000) / 10000;
  return ema;
}

function updateAllEMAs() {
  const keys = Object.keys(symbols);
  const promises = [];

  for (let i = 0; i < keys.length; i++) {
    promises.push(
      KRKN_REST.getOHLCData(keys[i], 5) // 5-minute datapoints
      .then(openPrices => {
        symbols[keys[i]].EMA = calculateEMA(openPrices);
      })
      .catch(error => {
        console.error('Error fetching OHLC data:', error);
      })
    );
  }
  
   // Wait for all promises to resolve before logging symbols
  Promise.all(promises)
    .then(() => {
      // console.log(symbols);
    })
    .catch(err => {
      console.error('Error in Promise.all:', err);
    });
}

function evaluateTradeWithEMA(symbol, ask) {  
  if (symbols[symbol].EMA !== undefined) {
    if (symbols[symbol].holding > 0.000001){
      if (ask < symbols[symbol].EMA){
        trade(symbol, ask, 'sell')
      }
    }else{
      console.log(symbols[symbol], ask);
      if (ask > symbols[symbol].EMA){
        trade(symbol, ask, 'buy')
      }
    }
  }
}

let lastCallTime = 0;
wsManager.on('update', (data) => {
  // console.log('Received update:', data);
  symbols[data.symbol]['24h change'] = data.change_pct;
  
  const currentTime = Date.now();
  if (currentTime - lastCallTime < 100) return;
  lastCallTime = currentTime;

  // fileManager.writeToLogFile(`${data.symbol} ask: ${data.ask} ema: ${symbols[data.symbol].EMA}`);
  evaluateTradeWithEMA(data.symbol, data.ask);
  // evaluateTradeWithEMA(data.symbol, 5);

  // console.log(`Updated ${data.symbol}:`, symbols[data.symbol], data.ask);
});

async function updateBalance() {
  const { balance } = await KRKN_REST.getAccountBalance();
    // console.log(`balance: ${JSON.stringify(balance)}`);

    Object.keys(symbols).forEach(key => {
      const symbol = symbols[key];
      const currencyCode = symbol["currency code"];
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
    setInterval(updateAllEMAs, 5*60*1000) // Call every 5 minutes (3000 000 milliseconds )

    wsManager.connectWebSocket(symbols);
    telegramBot.messageSubscribers('Script initialized and running...')
    fileManager.writeToLogFile('Script initialized and running...');
  } catch (error) {
    console.log(error); 
  }
}
start();

process.on('SIGINT', () => {
  console.log('Caught interrupt signal (Ctrl+C). Performing cleanup...');

  // fileManager.saveObjects(symbols, telegramBot.subscribersObj)
  wsManager.disconnect();
  fileManager.writeToLogFile('Program terminated by user (Ctrl+C).');
  telegramBot.messageSubscribers('Script shutting down...');

  process.exit(0);
});
