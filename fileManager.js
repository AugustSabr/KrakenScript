const fs = require('fs');


module.exports = {saveObjects, loadObjects, writeToLogFile, emptyLogFile};


function saveObjects(symbolsObj, subscribersObj) {
  objToJsonFile(JSON.stringify(symbolsObj, null, 2), `./data/marketData.json`);
  objToJsonFile(JSON.stringify(subscribersObj, null, 2), `./data/subscribers.json`);
}

async function loadObjects() {
  try {
    const [obj1, obj2] = await Promise.all([
      jsonFileToObj(`./data/marketData.json`),
      jsonFileToObj(`./data/subscribers.json`),
    ]);
    return { symbolsObj: obj1, subscribersObj: obj2 };
  } catch (err) {
    console.error('Error loading objects:', err);
    throw err; // Rethrow the error to allow the caller to handle it
  }
}

async function loadObjects(jsonString, path) {
  try {
    return await fs.promises.writeFile(path, jsonString);
  } catch (err) {
    console.error('Error writing file:', err);
    throw err; // Reject with the error
  }
}

async function jsonFileToObj(path) {
  return fs.promises.readFile(path, 'utf8')
    .then(function(data) {
      try {
        const parsedData = JSON.parse(data);
        if (!parsedData || typeof parsedData !== 'object') {
          throw new Error('Invalid JSON data');
        }
        return parsedData;
      } catch (error) {
        console.error('Error parsing JSON file:', error);
        throw error;
      }
    })
    .catch(function(err) {
      console.error('Error reading file:', err);
      throw err;
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