import express from 'express';
import cron from 'node-cron';
import Vonage from '@vonage/server-sdk';
import puppeteerExtra from 'puppeteer-extra';
import pluginStealth from 'puppeteer-extra-plugin-stealth';
import { apiKey, apiSecret, stores, from, to } from './data.json';

type StoreKey = keyof typeof stores;

const app = express();
const vonage = new Vonage({ apiKey, apiSecret });
puppeteerExtra.use(pluginStealth());

scheduleJobs();

function scheduleJobs() {
  cron.schedule('0 */1 * * * *', async () => {
    log('Running PS5 stock check every minute...');
    await checkStock();
  });

  cron.schedule('0 0 */1 * * *', async () => {
    log('Running tests every hour to make sure in stock pages are working...');
    await runTests();
  });
}

async function checkStock() {
  const [inStockAnywhere, inStockStoreKeys] = await getAllStoresWithStock();
  if (inStockAnywhere) {
    const text = generateText(inStockStoreKeys);
    log(text);
    sendText(text);
  }
}

async function runTests() {
  const [, testInStockKeys] = await getAllStoresWithStock({ testing: true });
  if (testInStockKeys.length === Object.keys(stores).length) {
    log('✅ In stock test pages appear to be working');
  } else {
    const text = `There is a problem with the in stock test pages. Test pages showing in stock are ${testInStockKeys.join(
      ', '
    )} \n`;
    log(text);
    sendText(text);
    manuallyCheckTestPages();
  }
}

function generateText(storeKeys: StoreKey[]) {
  let text = '';
  storeKeys.forEach((key) => {
    text += `In stock at ${key}: ${stores[key].url} \n`;
  });
  return text;
}

async function getAllStoresWithStock(
  options: { testing?: boolean } = {}
): Promise<[boolean, StoreKey[]]> {
  const { testing = false } = options;
  const inStockStoreKeys: StoreKey[] = [];
  const storeKeys = Object.keys(stores) as StoreKey[];

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

async function inStockAt(url: string, selector: string, key: StoreKey) {
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
    log(`❌ Not in stock at ${key}`);
  } else {
    log(`✅ In stock at ${key}`);
  }

  await browser.close();
  return html !== null;
}

function sendText(text: string) {
  vonage.message.sendSms(from, to, text, {}, (err, responseData) => {
    if (err) {
      log(err);
    } else {
      if (responseData.messages[0]['status'] === '0') {
        log('Message sent successfully.');
      } else {
        log(
          `Message failed with error: ${responseData.messages[0]['error-text']}`
        );
      }
    }
  });
}

async function manuallyCheckTestPages() {
  const keys = Object.keys(stores) as StoreKey[];
  for (let i = 0; i < keys.length; i++) {
    const url = stores[keys[i]].testInStock;
    const browser = await puppeteerExtra.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto(url);
  }
}

function log(message: any) {
  const localTime = new Date().toLocaleString();
  console.log(`[${localTime}] ${message}`);
}

app.listen(6969, () => {
  log('Server started at port 6969');
});
