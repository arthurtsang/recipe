import { When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { RecipeWorld } from '../support/world';

Then('I should see language options', async function (this: RecipeWorld) {
  await expect(this.page!.getByText(/english|chinese|语言|語言/i)).toBeVisible({ timeout: 3000 });
});

When('I switch to Chinese', async function (this: RecipeWorld) {
  const chineseOption = this.page!.getByRole('menuitem', { name: /中文|chinese/i });
  await chineseOption.click();
  await this.page!.waitForTimeout(500);
});

When('I switch back to English', async function (this: RecipeWorld) {
  await this.page!.locator('[class*="MuiAvatar"]').first().click();
  await this.page!.waitForSelector('[role="menu"]', { state: 'visible' });
  const englishOption = this.page!.getByRole('menuitem', { name: /english|英文/i });
  await englishOption.click();
  await this.page!.waitForTimeout(500);
});

Then('the app should display in Chinese', async function (this: RecipeWorld) {
  await expect(this.page!.getByText(/食譜|搜尋|新增/i)).toBeVisible({ timeout: 5000 });
});

Then('the app should display in English', async function (this: RecipeWorld) {
  await expect(this.page!.getByText(/Recipes|Search|Add Recipe/i)).toBeVisible({ timeout: 5000 });
});
