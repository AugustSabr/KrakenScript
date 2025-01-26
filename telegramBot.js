const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config({ path: './keys.env' });
const KRKN_REST = require('./APIs/KRKN_REST');


const token = process.env.TLGRM_BOT_TOKEN;
const TLGRM_MSG_ID = process.env.TLGRM_MSG_ID;
const bot = new TelegramBot(token, { polling: true });
let subscribersObj;
const messageAgeLimit = 5; // in seconds


module.exports = {set subscribersObj(value) {subscribersObj = value;}, messageMe, messageSubscribers, morningUpdate};


function isMessageTooOld(msg) {
  const currentTime = Date.now() / 1000;
  const messageTime = msg.date;

  if ((currentTime - messageTime) > messageAgeLimit) return true;
  return false;
}

function messageMe(msg) {
  bot.sendMessage(TLGRM_MSG_ID, msg);
}

bot.onText(/\/start/, function(msg) {
  if (isMessageTooOld(msg)) return;  
  bot.sendMessage(msg.chat.id, 'This is a bot that helps you buy crypto. Use /subscribe to get daily updates');
});

bot.onText(/\/subscribe/, function(msg) {
  if (isMessageTooOld(msg)) return;
  bot.sendMessage(msg.chat.id, manageSubscriber(msg.chat.id, 'add'));
});

bot.onText(/\/unsubscribe/, function(msg) {
  if (isMessageTooOld(msg)) return;
  bot.sendMessage(msg.chat.id, manageSubscriber(msg.chat.id, 'remove'));
});

function manageSubscriber(msgChatId, request) {
  let reply = '';
  const index = subscribersObj.subscribers.findIndex(function(subscriber) {
    return subscriber.chatId === msgChatId;
  });
  if (request === 'add') {
    if (index === -1) {
      subscribersObj.subscribers.push({"chatId": msgChatId});
      reply = 'Added you to the subscribers list';
    } else {
      reply = 'You are already on the subscribers list';
    }
  } else if (request === 'remove') {
    if (index !== -1) {
      subscribersObj.subscribers.splice(index, 1);
      reply = 'Removed you from the subscribers list';
    } else {
      reply = 'You were not on the subscribers list.';
    }
  }
  return reply;
}

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

bot.onText(/\/balance/, function(msg) {
  if (isMessageTooOld(msg)) return;
  if (msg.chat.id == TLGRM_MSG_ID) {
    KRKN_REST.getAccountBalance()
    .then(function({ balance }) {
      bot.sendMessage(TLGRM_MSG_ID, `balance: ${JSON.stringify(balance)}`);
    })
  } else {
    bot.sendMessage(msg.chat.id, "you don't have permission to execute this command");
  }
});

bot.onText(/\/kill/, function(msg) {
  if (isMessageTooOld(msg)) return;  
  if (msg.chat.id == TLGRM_MSG_ID) {
    bot.sendMessage(TLGRM_MSG_ID, 'killing script')
    .then(function() {
      process.exit(0);
    });
  } else {
    bot.sendMessage(msg.chat.id, "you don't have permission to execute this command");
  }
});