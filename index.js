const express = require('express');
const app = express();
const cron = require('node-cron');
const Vonage = require('@vonage/server-sdk');
const puppeteerExtra = require('puppeteer-extra');
const pluginStealth = require('puppeteer-extra-plugin-stealth');
const { apiKey, apiSecret, stores, from, to } = require('./data.json');

const vonage = new Vonage({ apiKey, apiSecret });
puppeteerExtra.use(pluginStealth());

scheduleJobs();

function scheduleJobs() {
  cron.schedule('0 */1 * * * *', async () => {
    console.log('Running PS5 stock check every minute...');
    await checkStock();
  });

  cron.schedule('0 0 */1 * * *', async () => {
    console.log(
      'Running tests every hour to make sure in stock pages are working...'
    );
    await runTests();
  });
}

async function checkStock() {
  const [inStockAnywhere, inStockStoreKeys] = await getAllStoresWithStock();
  if (inStockAnywhere) {
    const text = generateText(inStockStoreKeys);
    console.log(text);
    sendText(text);
  }
}

async function runTests() {
  const [, testInStockKeys] = await getAllStoresWithStock({ testing: true });
  if (testInStockKeys.length === Object.keys(stores).length) {
    console.log('✅ In stock test pages appear to be working');
  } else {
    const text = `There is a problem with the in stock test pages. Test pages showing in stock are ${testInStockKeys.join(
      ', '
    )}\n`;
    console.log(text);
    sendText(text);
    manuallyCheckTestPages();
  }
}

function generateText(storeKeys) {
  let text = '';
  storeKeys.forEach((key) => {
    text += `In stock at ${key}: ${stores[key].url} \n`;
  });
  return text;
}

async function getAllStoresWithStock(options = {}) {
  const { testing = false } = options;
  const inStockStoreKeys = [];
  const storeKeys = Object.keys(stores);

  for (let i = 0; i < storeKeys.length; i++) {
    const key = storeKeys[i];
    const { url, selector, testInStock } = stores[key];
    const inStock = await inStockAt(testing ? testInStock : url, selector, key);
    if (inStock) {
      inStockStoreKeys.push(key);
    }
  }

  const inStockAnywhere = inStockStoreKeys.length > 0;

  return [inStockAnywhere, inStockStoreKeys];
}

async function inStockAt(url, selector, key) {
  let html = null;
  const browser = await puppeteerExtra.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url);
  const results = await page.$(selector);

  if (results != null) {
    html = await results.evaluate((element) =>
      element ? element.innerHTML : null
    );
  }

  if (html === null) {
    console.log(`❌ Not in stock at ${key}`);
  } else {
    console.log(`✅ In stock at ${key}`);
  }

  await browser.close();
  return html !== null;
}

function sendText(text) {
  vonage.message.sendSms(from, to, text, (err, responseData) => {
    if (err) {
      console.log(err);
    } else {
      if (responseData.messages[0]['status'] === '0') {
        console.log('Message sent successfully.');
      } else {
        console.log(
          `Message failed with error: ${responseData.messages[0]['error-text']}`
        );
      }
    }
  });
}

async function manuallyCheckTestPages() {
  const keys = Object.keys(stores);
  for (let i = 0; i < keys.length; i++) {
    const url = stores[keys[i]].testInStock;
    const browser = await puppeteerExtra.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto(url);
  }
}

app.listen(6969, () => {
  console.log('Server started at port 6969');
});
