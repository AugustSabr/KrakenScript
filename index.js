require('dotenv').config({ path: './keys.env' });

const telegramBot = require('./telegramBot');
const fileManager = require('./fileManager');
const KRKN_REST = require('./APIs/KRKN_REST');
const { WebSocketManager } = require('./APIs/KRKN_WS');

const wsManager = new WebSocketManager();
let symbols;

function trade(symbol, ask, action) {
  if (action == 'buy') {
    //comming soon
    telegramBot.messageSubscribers(`sending a buy-order for ${symbol.name} at ${ask}$`)
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
        trade(symbols[symbol], ask, 'sell')
      }
    }else{
      if (ask > symbols[symbol].EMA){
        trade(symbols[symbol], ask, 'buy')
        }
    }
  }
}

wsManager.on('update', (data) => {
  // console.log('Received update:', data);
  symbols[data.symbol]['24h change'] = data.change_pct;

  evaluateTradeWithEMA(data.symbol, data.ask);

  // console.log(`Updated ${data.symbol}:`, symbols[data.symbol]);
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
      // console.log(`balance: ${JSON.stringify(balance)}`);
    // })
    updateAllEMAs();
    setInterval(updateAllEMAs, 5*60*1000) // Call every 5 minutes (3000 000 milliseconds )
    wsManager.connectWebSocket(symbols);
  })
  .then(function () {
    telegramBot.messageSubscribers('Script initialized and running...')
    fileManager.writeToLogFile('Script initialized and running...');
  })
  .catch(function(err) {
    console.error('Error loading objects:', err);
  });
}
start();