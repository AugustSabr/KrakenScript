const WebSocket = require('ws');
require('dotenv').config({ path: './keys.env' });
const https = require('https'); // For å gjøre REST API-forespørsler
const fs = require('fs');

const telegramBot = require('./telegramBot');
const telegramBot = require('./fileManager');

// Load environment variables
const KRKN_WS_URL = 'wss://ws.kraken.com/v2'; // WebSocket API v2 endpoint
const KRKN_REST_URL = 'api.kraken.com';
const KRKN_API_KEY = process.env.KRKN_API_KEY;
const KRKN_PRIVATE_KEY = process.env.KRKN_PRIVATE_KEY;

if (!KRKN_API_KEY || !KRKN_PRIVATE_KEY) {
  console.error('API Key or Private Key is missing in .env file!');
  process.exit(1);
}

// Funksjon for å hente OHLC data fra Kraken REST API
function getOHLCData(pair, interval = 1) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: KRKN_REST_URL,
      path: `/0/public/OHLC?pair=${pair}&interval=${interval}&since=${Math.floor(Date.now() / 1000)- (15 * 24 * 60 * 60)}`,
      method: 'GET'
    };

    https.get(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          if (parsedData.error && parsedData.error.length > 0) {
            throw new Error('Error from Kraken API: ' + parsedData.error.join(', '));
          }

          const openPrices = parsedData.result[Object.keys(parsedData.result)[0]].map(item => item[4]);
          // console.log(pair, 'Closing Prices:', interval, openPrices.reverse().slice(0, 50));
          // console.log('OHLC Data:', parsedData.result);
          resolve(openPrices);
        } catch (error) {
          console.error('Error parsing OHLC data:', error);
        }
      });
    }).on('error', (err) => {
      console.error('Request error:', err);
    });
  });
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
      getOHLCData(keys[i], 5) // 5-minute datapoints
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

updateAllEMAs()

function evaluateTradeWithEMA(symbol, ask) {
  if (symbols[symbol].EMA !== undefined) {
    if (symbols[symbol].holding){
      if (ask < symbols[symbol].EMA){
        writeToLogFile(`sell: ${symbol} is below EMA ${ask} < ${symbols[symbol].EMA}`);
      }
    }else{
      if (ask > symbols[symbol].EMA){
        writeToLogFile(`buy: ${symbol} is above EMA ${ask} < ${symbols[symbol].EMA}`);
        }
    }
  }
}

// Connect to the WebSocket API
function connectWebSocket() {
  // Connect to the WebSocket API
  const ws = new WebSocket(KRKN_WS_URL);

  // Event: On connection open
  ws.on('open', () => {
      writeToLogFile('Connected to WebSocket API v2');
      let symbolsKeys = Object.keys(symbols);

      const subscriptionMessage = {
        method: 'subscribe',
        params: {
            channel: 'ticker',
            symbol: symbolsKeys.map(symbolsKeys => symbolsKeys.slice(0, -3) + '/' + symbolsKeys.slice(-3)), //adds a "/"; BTCUSD => BTC/USD
            event_trigger: 'trades'
        }
      };
      ws.send(JSON.stringify(subscriptionMessage));

      writeToLogFile(`Subscription message sent: ${JSON.stringify(subscriptionMessage)}`);
  });

  // Event: On receiving a message
  ws.on('message', (data) => {
      try {
          const parsedData = JSON.parse(data);
          // console.log(`Received message: ${parsedData}`);


          if (parsedData.error) {
            throw new Error('Message contains an error: ' + parsedData.error);
          }

          // If the message doesn't match condition, discard it
          if (parsedData.channel !== 'ticker') {
            return;
          }
          const symbol = parsedData.data[0].symbol.replace(/\//g, '');
          
          // console.log('Update received:', symbol, parsedData.data[0].bid, parsedData.data[0].ask, symbol, parsedData.data[0].change_pct);
          symbols[symbol]["24h change"] = parsedData.data[0].change_pct
          evaluateTradeWithEMA(symbol, parsedData.data[0].ask);
      } catch (error) {
          console.error('Error on receiving a message:\n', error);
      }
  });

  // Event: On connection close
  ws.on('close', (code, reason) => {
      writeToLogFile(`Connection closed: Code=${code}, Reason=${reason}`);
  });

  // Event: On error
  ws.on('error', (error) => {
      console.error('WebSocket error:', error);
  });

  // Closing connection before exiting, Ctrl+C 
  process.on('SIGINT', () => {
    writeToLogFile('Closing WebSocket connection...');
    console.log('Closing WebSocket connection...');
    ws.close();
    process.exit(0);
  });
}

function writeToLogFile(message) {
  const logMessage = `[${new Date().toISOString()}] ${String(message)}\n`;
  fs.appendFile('krakenScript.log', logMessage, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });
}

function emptyLogFile (){
  fs.writeFile('krakenScript.log', '', (err) => {
    if (err) {
      console.error('Error emptying the log file:', err);
    } else {
      writeToLogFile('Log file emptied successfully.');
    }
  });
}

function start() {
  telegramBot.messageMe('Script initialized and running...');
  emptyLogFile();

  // updateAllEMAs();
  // setInterval(updateAllEMAs, 5*60*1000) // Call every 5 minutes (3000 000 milliseconds )
  connectWebSocket();
  writeToLogFile('Script initialized and running...');

  console.log('Currently testing the telegram bot');
}
start();
