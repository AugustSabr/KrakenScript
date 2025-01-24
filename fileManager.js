const fs = require('fs');


module.exports = {saveObjects, loadObjects};


function saveObjects(symbolsObj, subscribersObj) {
  objToJsonFile(JSON.stringify(symbolsObj, null, 2), `./data/marketData.json`);
  objToJsonFile(JSON.stringify(subscribersObj, null, 2), `./data/subscribers.json`);
}

function loadObjects() {
  return Promise.all([
    jsonFileToObj(`./data/marketData.json`),
    jsonFileToObj(`./data/subscribers.json`),
  ])
    .then(function([obj1, obj2]) {
      return { symbolsObj: obj1, subscribersObj: obj2 };
    })
    .catch(function(err) {
      console.error('Error loading objects:', err);
      throw err;  // Rethrow the error to allow the caller to handle it
    });
}

function objToJsonFile(jsonString, path) {
  return fs.promises.writeFile(path, jsonString)
    .catch(function(err) {
      console.error('Error writing file:', err);
      throw err;  // Reject with the error
    });
}

function jsonFileToObj(path) {
  return fs.promises.readFile(path, 'utf8')
    .then(function(data) {
      return JSON.parse(data);
    })
    .catch(function(err) {
      console.error('Error reading file:', err);
      throw err;  // Reject with the error
    });
}