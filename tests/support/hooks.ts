import { Before, After, Status, setDefaultTimeout } from '@cucumber/cucumber';
import { chromium } from '@playwright/test';
import type { RecipeWorld } from './world';

setDefaultTimeout(600_000);

Before({ tags: '@api' }, async function (this: RecipeWorld) {
  this.initApiClient();
});

Before({ tags: 'not @api' }, async function (this: RecipeWorld) {
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
    ...(this.storageStatePath ? { storageState: this.storageStatePath } : {}),
  });
  this.page = await this.context.newPage();
});

After({ tags: '@api' }, async function (this: RecipeWorld) {
  if (process.env.BDD_CLEANUP !== '0' && this.api) {
    for (const recipeId of this.createdRecipeIds) {
      try {
        await this.api.delete(`/api/recipes/${recipeId}`);
      } catch {
        /* ignore cleanup errors */
      }
    }
    for (const jobId of this.createdImportJobIds) {
      try {
        await this.api.delete(`/api/imports/${jobId}`);
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
});

After({ tags: 'not @api' }, async function (this: RecipeWorld, { result }) {
  if (result?.status === Status.FAILED && this.page) {
    const screenshot = await this.page.screenshot({ path: `screenshots/failure-${Date.now()}.png` });
    this.attach(screenshot, 'image/png');
  }
  await this.page?.close();
  await this.context?.close();
  await this.browser?.close();
});
