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
        if (symbols[key].holding === false) {
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
  if (action == 'buy') {
    // KRKN_REST.AddOrder()
    const cl_ord_id = uuidv4();
    getAvailableUSD()
    .then(function(availableUSD) {
      // console.log("Available USD per reserved item: ", availableUSD);
      console.log(symbols[symbol]['currency code'], action, ask, availableUSD/ask, cl_ord_id);
      // AddOrder(symbols[symbol]['currency code'], action, ask, availableUSD/ask, cl_ord_id);
    });
    
    // const cl_ord_id = uuidv4();
    // console.log(symbols[symbol]['currency code'], action, ask, cl_ord_id);
    // console.log(symbol);
    
    // console.log(symbols[symbol]['currency code'], action, ask, cl_ord_id);
    
    telegramBot.messageSubscribers(`sending a buy-order for ${symbol} at ${ask}$`)
    fileManager.writeToLogFile(`buy: ${symbol} is above EMA ${ask} < ${symbols[symbol].EMA}`);
  } else if (action == 'sell'){
    //comming soon
    telegramBot.messageSubscribers(`sending a sell-order for ${symbol.name} at ${ask}$`)
    fileManager.writeToLogFile(`sell: ${symbol} is below EMA ${ask} < ${symbols[symbol].EMA}`);
  } else {
    fileManager.writeToLogFile(`Unrecognized action in trade() function: ${action}`);
    telegramBot.messageMe('something wrong in the trade() function')
  }
}

function calculateEMA(arr) {
  arr = arr.slice(-576).reverse(); //576 5-minute datapoints is 3 days

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
    if (symbols[symbol].holding){
      if (ask < symbols[symbol].EMA){
        trade(symbol, ask, 'sell')
      }
    }else{
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

function start() {
  fileManager.loadObjects()
  .then(function({ symbolsObj, subscribersObj }) {
    symbols = symbolsObj;
    telegramBot.subscribersObj = subscribersObj;
  })
  .then(function () {
    fileManager.emptyLogFile();
    // KRKN_REST.getAccountBalance()
    // .then(function({ balance }) {
    //   console.log(`balance: ${JSON.stringify(balance)}`);
    // })
    updateAllEMAs();
    setInterval(updateAllEMAs, 5*60*1000) // Call every 5 minutes (3000 000 milliseconds )
  })
  .then(function () {
    wsManager.connectWebSocket(symbols);
    telegramBot.messageSubscribers('Script initialized and running...')
    fileManager.writeToLogFile('Script initialized and running...');
  })
  .catch(function(err) {
    console.error('Error loading objects:', err);
  });
}
start();