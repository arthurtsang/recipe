import { Before, After, Status } from '@cucumber/cucumber';
import { chromium } from '@playwright/test';
import type { RecipeWorld } from './world';

Before(async function (this: RecipeWorld) {
  this.browser = await chromium.launch({
    headless: process.env.HEADED !== '1',
    slowMo: process.env.HEADED === '1' ? 100 : 0,
    args: [
      '--ignore-certificate-errors',
      '--allow-insecure-localhost',
      '--disable-web-security',
      '--no-sandbox',
    ],
  });
  this.context = await this.browser.newContext({
    baseURL: this.baseUrl,
    ignoreHTTPSErrors: true,
  });
  this.page = await this.context.newPage();
});

After(async function (this: RecipeWorld, { result }) {
  if (result?.status === Status.FAILED && this.page) {
    const screenshot = await this.page.screenshot({ path: `screenshots/failure-${Date.now()}.png` });
    this.attach(screenshot, 'image/png');
  }
  await this.page?.close();
  await this.context?.close();
  await this.browser?.close();
});
