const WebSocket = require('ws');
require('dotenv').config({ path: './keys.env' });

// Load environment variables
const KRKN_WS_URL = 'wss://ws.kraken.com/v2'; // WebSocket API v2 endpoint
const apiKey = process.env.API_KEY;
const privateKey = process.env.PRIVATE_KEY;

if (!apiKey || !privateKey) {
  console.error('API Key or Private Key is missing in .env file!');
  process.exit(1);
}

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

    console.log('Subscription message sent:', subscriptionMessage);
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