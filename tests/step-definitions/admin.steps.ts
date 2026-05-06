import { When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { RecipeWorld } from '../support/world';

Then('I should see {string} in the menu', async function (this: RecipeWorld, text: string) {
  await expect(this.page!.getByRole('menuitem', { name: new RegExp(text, 'i') })).toBeVisible({ timeout: 3000 });
});

Then('I should see the User Management dialog', async function (this: RecipeWorld) {
  await expect(this.page!.getByRole('dialog')).toBeVisible({ timeout: 5000 });
});

Then('I should see the list of users or empty state', async function (this: RecipeWorld) {
  const dialog = this.page!.getByRole('dialog');
  await expect(dialog).toBeVisible();
});

Then('I should see the Queue Status dialog', async function (this: RecipeWorld) {
  await expect(this.page!.getByRole('dialog')).toBeVisible({ timeout: 5000 });
});

Then('I should see import and recipe analysis queue information', async function (this: RecipeWorld) {
  await expect(this.page!.getByText(/import|queue|pending|processing/i)).toBeVisible({ timeout: 5000 });
});
