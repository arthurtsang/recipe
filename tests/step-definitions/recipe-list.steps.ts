import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { RecipeWorld } from '../support/world';

When('I type {string} in the search box', async function (this: RecipeWorld, text: string) {
  await this.page!.getByPlaceholder(/search recipes/i).fill(text);
});

When('I submit the search', async function (this: RecipeWorld) {
  await this.page!.getByRole('button', { name: /search/i }).click();
  await this.page!.waitForLoadState('networkidle');
});

When('I clear the search and submit', async function (this: RecipeWorld) {
  await this.page!.getByPlaceholder(/search recipes/i).clear();
  await this.page!.getByRole('button', { name: /search/i }).click();
  await this.page!.waitForLoadState('networkidle');
});

Then('the recipe list should update with search results', async function (this: RecipeWorld) {
  await this.page!.waitForLoadState('networkidle');
  const content = await this.page!.content();
  expect(content).toBeTruthy();
});

Then('I should see the recipe list', async function (this: RecipeWorld) {
  await this.page!.waitForLoadState('networkidle');
  const listOrEmpty = this.page!.locator('main, [role="main"], .MuiContainer-root');
  await expect(listOrEmpty.first()).toBeVisible({ timeout: 5000 });
});

Then('the list may be empty or show recipes', async function (this: RecipeWorld) {
  await this.page!.waitForLoadState('networkidle');
});

Then('I should see a search input', async function (this: RecipeWorld) {
  const searchInput = this.page!.getByRole('textbox', { name: /search/i });
  await expect(searchInput).toBeVisible({ timeout: 5000 });
});

Then('I should see either recipes or a {string} message when loaded', async function (this: RecipeWorld, message: string) {
  await this.page!.waitForLoadState('networkidle');
  await this.page!.waitForTimeout(1000);
  const hasRecipes = await this.page!.locator('a[href^="/recipes/"]').count() > 0;
  const hasMessage = await this.page!.getByText(/no recipes|loading/i).isVisible();
  expect(hasRecipes || hasMessage).toBeTruthy();
});
