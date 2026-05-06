import { When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { RecipeWorld } from '../support/world';

When('I click the app logo or title', async function (this: RecipeWorld) {
  await this.page!.getByRole('link', { name: /metro bistro|recipes/i }).first().click();
  await this.page!.waitForLoadState('networkidle');
});

Then('I should see the Import History dialog', async function (this: RecipeWorld) {
  await expect(this.page!.getByRole('dialog')).toBeVisible({ timeout: 5000 });
});

Then('I should see the API token management dialog', async function (this: RecipeWorld) {
  await expect(this.page!.getByRole('dialog')).toBeVisible({ timeout: 5000 });
  await expect(this.page!.getByText(/API token|token/i)).toBeVisible();
});
