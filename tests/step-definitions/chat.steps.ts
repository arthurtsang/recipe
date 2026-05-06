import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { RecipeWorld } from '../support/world';

When('I click the chat floating action button', async function (this: RecipeWorld) {
  await this.page!.locator('button[aria-label="chat"]').click();
  await this.page!.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 });
});

Then('I should see the Recipe Assistant chat dialog', async function (this: RecipeWorld) {
  await expect(this.page!.getByText(/Recipe Assistant/i)).toBeVisible({ timeout: 5000 });
});

Then('I should see the welcome message from the bot', async function (this: RecipeWorld) {
  await expect(this.page!.getByText(/recipe assistant|help you find/i)).toBeVisible({ timeout: 5000 });
});

Given('I have opened the chat', async function (this: RecipeWorld) {
  await this.page!.locator('button[aria-label="chat"]').click();
  await this.page!.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 });
});

When('I type {string} in the chat', async function (this: RecipeWorld, text: string) {
  const input = this.page!.getByPlaceholder(/ask me about|recipes|ingredients/i);
  await input.fill(text);
});

When('I send the chat message', async function (this: RecipeWorld) {
  const dialog = this.page!.getByRole('dialog');
  const sendBtn = dialog.getByRole('button').last();
  await sendBtn.click();
  await this.page!.waitForTimeout(3000);
});

Then('I should see my message in the chat', async function (this: RecipeWorld) {
  await expect(this.page!.getByText(/chicken/i)).toBeVisible({ timeout: 5000 });
});

Then('I should receive a response from the bot', async function (this: RecipeWorld) {
  await expect(this.page!.getByText(/mock|helpful|response|recipe/i)).toBeVisible({ timeout: 10000 });
});

When('I click a suggested question chip', async function (this: RecipeWorld) {
  await this.page!.getByRole('button', { name: /chicken|vegetarian|eggs|pasta|quick dinner/i }).first().click();
});

Then('the question should appear in the chat input', async function (this: RecipeWorld) {
  const input = this.page!.getByPlaceholder(/ask me about/i);
  await expect(input).not.toHaveValue('');
});

Then('I can send it to get a response', async function (this: RecipeWorld) {
  const sendBtn = this.page!.getByRole('dialog').getByRole('button').last();
  await sendBtn.click();
  await this.page!.waitForTimeout(3000);
  await expect(this.page!.getByText(/mock|helpful|response|recipe/i)).toBeVisible({ timeout: 10000 });
});
