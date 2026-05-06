import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { RecipeWorld } from '../support/world';

When('I fill in the recipe form with title {string}', async function (this: RecipeWorld, title: string) {
  await this.page!.getByLabel(/title/i).fill(title);
  await this.page!.getByLabel(/description/i).fill('Test description');
  await this.page!.getByLabel(/ingredients/i).fill('2 cups flour');
  await this.page!.getByLabel(/instructions/i).fill('Mix and bake');
});

When('I submit the recipe form', async function (this: RecipeWorld) {
  await this.page!.getByRole('button', { name: /submit|save/i }).click();
  await this.page!.waitForURL(/\/recipes\/[^/]+$/);
  await this.page!.waitForLoadState('networkidle');
});

Then('I should see {string}', async function (this: RecipeWorld, text: string) {
  await expect(this.page!.getByText(text, { exact: false })).toBeVisible({ timeout: 5000 });
});

Then('I should see the recipe title {string}', async function (this: RecipeWorld, title: string) {
  await expect(this.page!.getByText(title, { exact: false })).toBeVisible({ timeout: 5000 });
});

Then('I should see recipe ingredients or instructions', async function (this: RecipeWorld) {
  await expect(this.page!.getByText(/ingredients|instructions/i).first()).toBeVisible({ timeout: 5000 });
});

Given('there exists a recipe {string}', async function (this: RecipeWorld, _title: string) {
  const recipeLinks = this.page!.locator('a[href^="/recipes/"]');
  const count = await recipeLinks.count();
  if (count === 0) {
    await this.page!.goto('/recipes/new');
    await this.page!.getByLabel(/title/i).fill('Grandma\'s Soup');
    await this.page!.getByLabel(/description/i).fill('A warm soup');
    await this.page!.getByLabel(/ingredients/i).fill('Water, vegetables');
    await this.page!.getByLabel(/instructions/i).fill('Boil and serve');
    await this.page!.getByRole('button', { name: /submit/i }).click();
    await this.page!.waitForURL(/\/recipes\/[^/]+$/);
  }
});

Given('I have created a recipe {string}', async function (this: RecipeWorld, title: string) {
  await this.page!.goto('/recipes/new');
  await this.page!.waitForLoadState('networkidle');
  await this.page!.getByLabel(/title/i).fill(title);
  await this.page!.getByLabel(/description/i).fill('Test');
  await this.page!.getByLabel(/ingredients/i).fill('Test');
  await this.page!.getByLabel(/instructions/i).fill('Test');
  await this.page!.getByRole('button', { name: /submit/i }).click();
  await this.page!.waitForURL(/\/recipes\/[^/]+$/);
  await this.page!.waitForLoadState('networkidle');
});

When('I click on the recipe {string}', async function (this: RecipeWorld, title: string) {
  await this.page!.getByRole('link', { name: new RegExp(title, 'i') }).first().click();
  await this.page!.waitForLoadState('networkidle');
});

When('I open the recipe {string}', async function (this: RecipeWorld, title: string) {
  await this.page!.goto('/');
  await this.page!.waitForLoadState('networkidle');
  await this.page!.getByRole('link', { name: new RegExp(title, 'i') }).first().click();
  await this.page!.waitForLoadState('networkidle');
});

When('I click the edit button', async function (this: RecipeWorld) {
  await this.page!.getByRole('button', { name: /edit/i }).click();
  await this.page!.waitForTimeout(500);
});

When('I change the title to {string}', async function (this: RecipeWorld, newTitle: string) {
  await this.page!.getByLabel(/title/i).fill(newTitle);
});

When('I save the changes', async function (this: RecipeWorld) {
  await this.page!.getByRole('button', { name: /^save$/i }).first().click();
  await this.page!.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 2000 });
  await this.page!.getByRole('button', { name: /^save$/i }).last().click();
  await this.page!.waitForLoadState('networkidle');
});

When('I delete the recipe', async function (this: RecipeWorld) {
  await this.page!.getByRole('button', { name: /delete/i }).first().click();
  await this.page!.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 3000 });
  const deleteEntireBtn = this.page!.getByRole('button', { name: /delete recipe/i });
  if (await deleteEntireBtn.isVisible()) {
    await deleteEntireBtn.click();
  } else {
    await this.page!.getByRole('dialog').getByRole('button', { name: /delete/i }).click();
  }
  await this.page!.waitForURL(/\/(recipes)?\/?$/, { timeout: 5000 });
});

Then('I should not see {string} in the recipe list', async function (this: RecipeWorld, text: string) {
  await this.page!.goto('/');
  await this.page!.waitForLoadState('networkidle');
  await expect(this.page!.getByText(text)).not.toBeVisible();
});
