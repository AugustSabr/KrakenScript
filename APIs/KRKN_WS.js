const WebSocket = require('ws');
const EventEmitter = require('events');
const fileManager = require('../fileManager');

// Load environment variables
const KRKN_WS_URL = 'wss://ws.kraken.com/v2'; // WebSocket API v2 endpoint

class WebSocketManager extends EventEmitter {
  constructor() {
    super();
    this.symbols = {};
    this.ws = null;
    this.reconnectAttempts = 0
  }

// Connect to the WebSocket API
  connectWebSocket(symbols) {
    this.symbols = symbols;
    
    this.ws = new WebSocket(KRKN_WS_URL);

    // Event: On connection open
    this.ws.on('open', () => {
        fileManager.writeToLogFile('Connected to WebSocket API v2');
        this.reconnectAttempts = 0
        let symbolsKeys = Object.keys(symbols);

        const subscriptionMessage = {
          method: 'subscribe',
          params: {
              channel: 'ticker',
              symbol: symbolsKeys.map(symbolsKeys => symbolsKeys + '/USD'), // BTC => BTC/USD
              event_trigger: 'trades'
          }
        };
        this.ws.send(JSON.stringify(subscriptionMessage));

        fileManager.writeToLogFile(`Subscription message sent: ${JSON.stringify(subscriptionMessage)}`);
    });

    // Event: On receiving a message
    this.ws.on('message', (data) => {
        try {            
            const parsedData = JSON.parse(data);
            // console.log('Received message: ', parsedData);

            if (parsedData.error) {
              throw new Error('Message contains an error: ' + parsedData.error);
            }

            // If the message doesn't match condition, discard it
            if (parsedData.channel !== 'ticker') {
              return;
            }            
            const symbol = parsedData.data[0].symbol.split('/')[0];
            
            this.symbols[symbol]["24h change"] = parsedData.data[0].change_pct;

            this.emit('update', {symbol, ask: parsedData.data[0].ask, change_pct: parsedData.data[0].change_pct});

            // console.log('Update received:', symbol, parsedData.data[0].bid, parsedData.data[0].ask, symbol, parsedData.data[0].change_pct);
            // evaluateTradeWithEMA(symbol, parsedData.data[0].ask);
        } catch (error) {
            console.error('Error on receiving a message:\n', error);
        }
    });

    // Event: On connection close
    this.ws.on('close', (code, reason) => {
      fileManager.writeToLogFile(`Connection closed: Code=${code}, Reason=${reason}`);
      if (code !== 1000) { // Non-normal closure
        const delay = Math.min(30000, 5000 * Math.pow(2, this.reconnectAttempts)); // Exponential backoff with a cap
        setTimeout(() => {
          console.log('Reconnecting...');
          this.reconnectAttempts++;
          this.connectWebSocket(this.symbols);  // Attempt reconnection
        }, delay);
      }
    });

    // Event: On error
    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.reconnectAttempts++;
      this.connectWebSocket(this.symbols);  // Attempt reconnection on error
    });
  }

  disconnect() {
    fileManager.writeToLogFile('Closing WebSocket connection...');
    console.log('Closing WebSocket connection...');
    this.ws.close();
  }
}

module.exports = {WebSocketManager}