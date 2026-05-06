import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { RecipeWorld } from '../support/world';

Given('I am on the home page', async function (this: RecipeWorld) {
  await this.page!.goto('/');
  await this.page!.waitForLoadState('networkidle');
});

Given('I am on a recipe detail page', async function (this: RecipeWorld) {
  await this.page!.goto('/');
  await this.page!.waitForLoadState('networkidle');
  const recipeLink = this.page!.locator('a[href^="/recipes/"]').first();
  const count = await recipeLink.count();
  if (count > 0) {
    await recipeLink.click();
    await this.page!.waitForURL(/\/recipes\/[^/]+$/);
  } else {
    await this.page!.goto('/recipes/new');
  }
});

When('I navigate to {string}', async function (this: RecipeWorld, linkText: string) {
  await this.page!.getByRole('button', { name: new RegExp(linkText, 'i') }).first().click();
  await this.page!.waitForLoadState('networkidle');
});

Then('I should be on the home page', async function (this: RecipeWorld) {
  await expect(this.page!).toHaveURL(/\/$/);
});

Then('I should be on a recipe detail page', async function (this: RecipeWorld) {
  await expect(this.page!).toHaveURL(/\/recipes\/[^/]+$/);
});

Then('I should see the page title {string}', async function (this: RecipeWorld, title: string) {
  await expect(this.page!.getByRole('heading', { name: new RegExp(title, 'i') }).first()).toBeVisible({ timeout: 5000 });
});
