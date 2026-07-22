import { World, IWorldOptions, setWorldConstructor } from '@cucumber/cucumber';
import { Browser, BrowserContext, Page } from '@playwright/test';

export interface RecipeWorld extends World {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  baseUrl: string;
  storageStatePath?: string;
  apiToken?: string;
}

class CustomWorld extends World implements RecipeWorld {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  baseUrl: string;
  storageStatePath?: string;
  apiToken?: string;

  constructor(options: IWorldOptions) {
    super(options);
    const baseUrl = (process.env.BASE_URL || '').trim();
    if (!baseUrl) {
      throw new Error(
        'BASE_URL is required. Point Cucumber at the Vercel preview app, e.g. BASE_URL=https://recipe-preview.youramaryllis.com'
      );
    }
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.storageStatePath = (process.env.STORAGE_STATE || '').trim() || undefined;
  }
}

setWorldConstructor(CustomWorld);
