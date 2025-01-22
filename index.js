const WebSocket = require('ws');
require('dotenv').config({ path: './keys.env' });
const https = require('https'); // For å gjøre REST API-forespørsler

// Load environment variables
const KRKN_WS_URL = 'wss://ws.kraken.com/v2'; // WebSocket API v2 endpoint
const KRKN_REST_URL = 'api.kraken.com';
const apiKey = process.env.API_KEY;
const privateKey = process.env.PRIVATE_KEY;

if (!apiKey || !privateKey) {
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

          const openPrices = parsedData.result[Object.keys(parsedData.result)[0]].map(item => item[1]);
          // console.log('Open Prices:', interval, openPrices.reverse().slice(0, 50));
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
  arr = arr.slice(-192).reverse();

  const k = 2 / (arr.length + 1);
  let ema = arr[0];
  for (let i = 1; i < arr.length; i++) {
    ema = (arr[i] * k) + (ema * (1 - k));
  }
  ema = Math.round(ema * 10000) / 10000;
  return ema;
}

getOHLCData('BTCUSD', 15)
  .then(openPrices => {
    console.log('EMA:', calculateEMA(openPrices));
  })
  .catch(error => {
    console.error('Error fetching OHLC data:', error);
  });

// Connect to the WebSocket API
const ws = new WebSocket(KRKN_WS_URL);

// Event: On connection open
ws.on('open', () => {
    console.log('Connected to WebSocket API v2');

    const subscriptionMessage = {
      method: 'subscribe',
      params: {
          channel: 'ticker',
          symbol: ['BTC/USD'],
          event_trigger: 'trades'
      }
    };
    ws.send(JSON.stringify(subscriptionMessage));

    // console.log('Subscription message sent:', subscriptionMessage);
});

// Event: On receiving a message
ws.on('message', (data) => {
    try {
        const parsedData = JSON.parse(data);
        // console.log('Received message:', parsedData);

        if (parsedData.error) {
          throw new Error('Message contains an error: ' + parsedData.error);
        }

        // If the message doesn't match condition, discard it
        if (parsedData.channel !== 'ticker' || !parsedData.data[0].bid || !parsedData.data[0].ask) {
          return;
        }
        console.log('Update received:', parsedData.data[0].symbol, parsedData.data[0].bid, parsedData.data[0].ask);
    } catch (error) {
        console.error('Error on receiving a message:\n', error);
    }
});

// Event: On connection close
ws.on('close', (code, reason) => {
    console.log(`Connection closed: Code=${code}, Reason=${reason}`);
});

// Event: On error
ws.on('error', (error) => {
    console.error('WebSocket error:', error);
});

// Closing connection before exiting, Ctrl+C 
process.on('SIGINT', () => {
  console.log('Closing WebSocket connection...');
  ws.close();
  process.exit(0);
});