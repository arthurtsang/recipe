import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { RecipeWorld } from '../support/world';

Then('I should see the {string} button', async function (this: RecipeWorld, buttonText: string) {
  const button = this.page!.getByRole('button', { name: new RegExp(buttonText, 'i') });
  await expect(button.first()).toBeVisible({ timeout: 5000 });
});

Then('I should not see the {string} button', async function (this: RecipeWorld, buttonText: string) {
  const button = this.page!.getByRole('button', { name: new RegExp(buttonText, 'i') });
  await expect(button).toHaveCount(0);
});

When('I click the {string} button', async function (this: RecipeWorld, buttonText: string) {
  await this.page!.getByRole('button', { name: new RegExp(buttonText, 'i') }).first().click();
});

When('I complete the mock OAuth flow', async function (this: RecipeWorld) {
  await this.page!.waitForURL(/\/(auth|oauth|9999)/, { timeout: 5000 }).catch(() => {});
  await this.page!.waitForURL(
    url => !url.pathname.startsWith('/auth/google'),
    { timeout: 15000 }
  );
  await this.page!.waitForLoadState('networkidle');
});

Then('I should be logged in', async function (this: RecipeWorld) {
  await expect(this.page!.getByRole('button', { name: /Add Recipe/i })).toBeVisible({ timeout: 5000 });
});

Given('I am logged in', async function (this: RecipeWorld) {
  await this.page!.goto('/');
  await this.page!.waitForLoadState('networkidle');
  const loginButton = this.page!.getByRole('button', { name: /login/i });
  if (await loginButton.isVisible()) {
    await loginButton.click();
    await this.page!.waitForURL(/\/(auth|oauth|9999)/, { timeout: 5000 }).catch(() => {});
    await this.page!.waitForURL(
      url => !url.pathname.startsWith('/auth/google'),
      { timeout: 15000 }
    );
  }
  await this.page!.waitForLoadState('networkidle');
  await expect(this.page!.getByRole('button', { name: /Add Recipe/i })).toBeVisible({ timeout: 5000 });
});

Given('I am logged in as admin', async function (this: RecipeWorld) {
  await this.page!.goto('/');
  await this.page!.waitForLoadState('networkidle');
  const loginButton = this.page!.getByRole('button', { name: /login/i });
  if (await loginButton.isVisible()) {
    await loginButton.click();
    await this.page!.waitForURL(/\/(auth|oauth|9999)/, { timeout: 5000 }).catch(() => {});
    await this.page!.waitForURL(
      url => !url.pathname.startsWith('/auth/google'),
      { timeout: 15000 }
    );
  }
  await this.page!.waitForLoadState('networkidle');
  await expect(this.page!.getByRole('button', { name: /Add Recipe/i })).toBeVisible({ timeout: 5000 });
});

When('I open the user menu', async function (this: RecipeWorld) {
  await this.page!.locator('[class*="MuiAvatar"]').first().click();
  await this.page!.waitForSelector('[role="menu"]', { state: 'visible', timeout: 3000 });
});

When('I click the {string} menu item', async function (this: RecipeWorld, text: string) {
  await this.page!.getByRole('menuitem', { name: new RegExp(text, 'i') }).click();
});

Then('I should not be logged in', async function (this: RecipeWorld) {
  await expect(this.page!.getByRole('button', { name: /login/i })).toBeVisible({ timeout: 5000 });
});
