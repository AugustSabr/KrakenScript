const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config({ path: './keys.env' });

const token = process.env.TLGRM_BOT_TOKEN;
const MY_CHAT_ID = process.env.MY_CHAT_ID;
const TLGRM_MSG_ID = process.env.TLGRM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "I don't recognize that command");
});

function messageMe(msg) {
  bot.sendMessage(MY_CHAT_ID, msg);
}

// bot.onText(/\/subscribe/, function(msg) {
//   bot.sendMessage(msg.chat.id, manageSubscriber(msg.chat.id, 'add'));
// });

// bot.onText(/\/unsubscribe/, function(msg) {
//   bot.sendMessage(msg.chat.id, manageSubscriber(msg.chat.id, 'remove'));
// });

// function manageSubscriber(msgChatId, request) {
//   let reply = '';
//   const index = subscribersObj.subscribers.findIndex(function(subscriber) {
//     return subscriber.chatId === msgChatId;
//   });
//   if (request === 'add') {
//     if (index === -1) {
//       subscribersObj.subscribers.push({"chatId": msgChatId});
//       objToJsonFile(JSON.stringify(subscribersObj, null, 2), `./subscribers.json`);
//       reply = 'Added you to the subscribers list';
//     } else {
//       reply = 'You are already on the subscribers list';
//     }
//   } else if (request === 'remove') {
//     if (index !== -1) {
//       subscribersObj.subscribers.splice(index, 1);
//       objToJsonFile(JSON.stringify(subscribersObj, null, 2), `./subscribers.json`);
//       reply = 'Removed you from the subscribers list';
//     } else {
//       reply = 'You were not on the subscribers list.';
//     }
//   }
//   return reply;
// }

function messageSubscribers(msg) {
  subscribersObj.subscribers.forEach(function(subscriber) {
    bot.sendMessage(subscriber.chatId, msg);
  });
}

function morningUpdate() {
  const msg = `Good Morning!}`
  // const msg = `Good Morning! heres the current thresholds\n\n${thresholds()}`
  messageSubscribers(msg)
}

// function objToJsonFile(jsonString, path) {
//   return new Promise(function(resolve, reject) {
//     fs.promises.writeFile(path, jsonString)
//     .then(function() {
//       resolve();
//     })
//     .catch(function(err) {
//       console.error('Error writing file:', err);
//       messageMe('Error writing file')
//       reject(err);
//     });
//   });
// }

// function jsonFileToObj(path) {
//   return new Promise(function(resolve, reject) {
//     fs.promises.readFile(path, 'utf8')
//       .then(function(data) {
//         const obj = JSON.parse(data);
//         resolve(obj);
//       })
//       .catch(function(err) {
//         console.error('Error reading file:', err);
//         reject(err);
//       });
//   });
// }

bot.onText(/\/kill/, function(msg) {
  if (msg.chat.id === MY_CHAT_ID) {
    bot.sendMessage(msg.chat.id, 'killing script');    
    process.exit(0);
  } else {
    bot.sendMessage(msg.chat.id, "you don't have permission to kill the script");
  }
});