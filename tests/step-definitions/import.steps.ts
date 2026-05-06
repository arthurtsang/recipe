import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { RecipeWorld } from '../support/world';

Then('I should see the Import Recipe dialog', async function (this: RecipeWorld) {
  await expect(this.page!.getByRole('dialog')).toBeVisible({ timeout: 5000 });
  await expect(this.page!.getByText(/import recipe/i)).toBeVisible();
});

Given('I have opened the import dialog', async function (this: RecipeWorld) {
  await this.page!.getByRole('button', { name: /import/i }).first().click();
  await this.page!.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 });
});

When('I enter the URL {string}', async function (this: RecipeWorld, url: string) {
  const input = this.page!.getByLabel(/recipe url|url/i).or(this.page!.getByPlaceholder(/recipe|url/i));
  await input.first().fill(url);
});

When('I click the import button in the dialog', async function (this: RecipeWorld) {
  await this.page!.getByRole('dialog').getByRole('button', { name: /import/i }).click();
});

Then('I should see the import job processing or completed', async function (this: RecipeWorld) {
  await this.page!.waitForTimeout(2000);
  const dialog = this.page!.getByRole('dialog');
  await expect(dialog).toBeVisible();
});

Then('I should see {string} when import completes', async function (this: RecipeWorld, title: string) {
  await this.page!.waitForSelector(`text=${title}`, { timeout: 30000 });
});

Then('I can save the imported recipe', async function (this: RecipeWorld) {
  const saveBtn = this.page!.getByRole('button', { name: /save recipe/i });
  await expect(saveBtn).toBeVisible({ timeout: 15000 });
});

Then('I should see the recipe URL input', async function (this: RecipeWorld) {
  const input = this.page!.getByLabel(/recipe url|url/i).or(this.page!.getByPlaceholder(/recipe|url/i)).first();
  await expect(input).toBeVisible({ timeout: 3000 });
});

Then('I should see a multi-line URL input', async function (this: RecipeWorld) {
  const textarea = this.page!.locator('textarea');
  await expect(textarea).toBeVisible({ timeout: 3000 });
});

Then('I should see the bulk import button', async function (this: RecipeWorld) {
  await expect(this.page!.getByRole('button', { name: /import all/i })).toBeVisible({ timeout: 3000 });
});
