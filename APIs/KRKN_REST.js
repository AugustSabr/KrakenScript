require('dotenv').config({ path: './keys.env' });
const https = require('https');
const crypto = require('crypto');
const fileManager = require('../fileManager');
const { addWatchlist } = require('@alpacahq/alpaca-trade-api/dist/resources/watchlist');

// Load environment variables
const KRKN_REST_URL = 'api.kraken.com';
const KRKN_API_KEY = process.env.KRKN_API_KEY;
const KRKN_API_SECRET = process.env.KRKN_API_SECRET;

if (!KRKN_API_KEY || !KRKN_API_SECRET) {
  console.error('API Key or Private Key is missing in .env file!');
  process.exit(1);
}

let nonce = Date.now() * 1000;  // Start with a large number
const getNonce = () => {
  return nonce++; // Increment the nonce with each request
};

module.exports = {getOHLCData, getAccountBalance, AddOrder, makeRequestWithRetry}

async function makeRequestWithRetry(apiCall, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
      try {
          return await apiCall;
      } catch (error) {
          if (error.message.includes('EAPI:Invalid nonce') && attempt < retries) {
              console.log(`Retrying due to nonce error. Attempt ${attempt}...`);
              continue; // Retry with a new nonce
          }
          throw error; // Other errors or retries exhausted
      }
  }
}

// Funksjon for å hente OHLC data fra Kraken REST API
function getOHLCData(symbol, interval = 1) {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      hostname: KRKN_REST_URL,
      path: `/0/public/OHLC?pair=${symbol + '/USD'}&interval=${interval}&since=${Math.floor(Date.now() / 1000)- (15 * 24 * 60 * 60)}`
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
          // console.log(symbol, 'Closing Prices:', interval, openPrices.reverse().slice(0, 50));
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

function getAccountBalance() {
  return new Promise((resolve, reject) => {
    const nonce = getNonce();
    // console.log(nonce);
    const postData = JSON.stringify({ nonce });

    // Generate the signature
    const urlPath = '/0/private/Balance';
    const signature = generateSignature(urlPath, postData, nonce);

    const options = {
      method: 'POST',
      hostname: 'api.kraken.com',
      path: urlPath,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'API-Key': KRKN_API_KEY,
        'API-Sign': signature
      },
    };

    const req = https.request(options, (res) => {
      let chunks = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        try {
          const json = JSON.parse(body);
          if (json.error && json.error.length) {
            console.error('Error:', json.error);
            reject(json.error);
          } else {
            const balance = json.result;
            resolve({balance});
          }
        } catch (err) {
          console.error('JSON Parse Error:', err);
          reject(err);
        }
      });

      res.on('error', (error) => {
        console.error('Request Error:', error);
        reject(error);
      });
    });

    req.write(postData);
    req.end();
  });
}

function AddOrder(currencyCode, action, price, volume, id) {
  return new Promise((resolve, reject) => {

    
    const nonce = getNonce();

    let postData = JSON.stringify({
      "nonce": nonce,
      "ordertype": "limit",
      "type": action,
      "volume": volume,
      "pair": currencyCode+'/USD',
      "price": price,
      "cl_ord_id": id,
      "expiretm": '+10'
    });

    // Generate the signature
    const urlPath = '/0/private/AddOrder';
    const signature = generateSignature(urlPath, postData, nonce);

    const options = {
      method: 'POST',
      hostname: 'api.kraken.com',
      path: urlPath,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'API-Key': KRKN_API_KEY,
        'API-Sign': signature
      },
    };

    const req = https.request(options, (res) => {
      let chunks = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        try {
          const json = JSON.parse(body);
          if (json.error && json.error.length) {
            resolve({ success: false, error: json.error });
            reject(json.error);
          } else {
            resolve({ success: true, result: json.result });
          }
        } catch (err) {
          console.error('JSON Parse Error:', err);
          resolve({ success: false, error: 'JSON Parse Error' });
        }
      });

      res.on('error', (error) => {
        console.error('Request Error:', error);
        resolve({ success: false, error: 'Request Error' });
      });
    });

    req.write(postData);
    req.end();
  });
}

// Helper function to generate Kraken API signature
function generateSignature(urlPath, postData, nonce) {
  const secret = Buffer.from(KRKN_API_SECRET, 'base64');
  const payload = nonce + postData;
  const hash = crypto.createHash('sha256').update(payload).digest();
  const hmac = crypto.createHmac('sha512', secret);
  hmac.update(Buffer.concat([Buffer.from(urlPath), hash]));
  return hmac.digest('base64');
}