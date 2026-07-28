import { World, IWorldOptions, setWorldConstructor } from '@cucumber/cucumber';
import { Browser, BrowserContext, Page } from '@playwright/test';
import { ApiClient, ApiJson } from './api-client';
import { loadTestsEnv } from './load-env';

loadTestsEnv();

export interface RecipeWorld extends World {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  baseUrl: string;
  storageStatePath?: string;
  apiToken?: string;
  api?: ApiClient;
  lastResponse?: { status: number; body: ApiJson | string };
  lastJob?: ApiJson;
  lastRecipe?: ApiJson;
  createdRecipeIds: string[];
  createdImportJobIds: string[];
}

class CustomWorld extends World implements RecipeWorld {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  baseUrl: string;
  storageStatePath?: string;
  apiToken?: string;
  api?: ApiClient;
  lastResponse?: { status: number; body: ApiJson | string };
  lastJob?: ApiJson;
  lastRecipe?: ApiJson;
  createdRecipeIds: string[] = [];
  createdImportJobIds: string[] = [];

  constructor(options: IWorldOptions) {
    super(options);
    const baseUrl = (process.env.BASE_URL || '').trim();
    if (!baseUrl) {
      throw new Error(
        'BASE_URL is required. Example: BASE_URL=https://recipe-preview.youramaryllis.com'
      );
    }
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.storageStatePath = (process.env.STORAGE_STATE || '').trim() || undefined;
  }

  initApiClient(): void {
    const apiToken = (process.env.API_TOKEN || '').trim();
    if (!apiToken) {
      throw new Error(
        'API_TOKEN is required for @api scenarios. Set it in tests/.env (see tests/env.example).'
      );
    }
    this.apiToken = apiToken;
    this.api = new ApiClient(this.baseUrl, apiToken);
  }
}

setWorldConstructor(CustomWorld);
