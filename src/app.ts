import express from 'express';
import cron from 'node-cron';
import { log, checkStock } from './utils';

const app = express();

scheduleJobs();

function scheduleJobs() {
  cron.schedule('0 */1 * * * *', async () => {
    log('Running PS5 stock check every minute...');
    await checkStock();
  });

  // Disabling tests to only get a text when stock is detected
  // This is probably only useful for manual testing
  // cron.schedule('0 0 */1 * * *', async () => {
  //   log('Running tests every hour to make sure in stock pages are working...');
  //   await runTests();
  // });
}

app.listen(6969, () => {
  log('Server started at port 6969');
});
